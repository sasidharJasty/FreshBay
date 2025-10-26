from __future__ import annotations

import random
from decimal import Decimal
from math import atan2, cos, radians, sin, sqrt
from django.core.exceptions import ObjectDoesNotExist
from django.core.mail import send_mail
from django.contrib.auth import get_user_model, login, logout
from django.contrib.auth.models import Group
from django.http import JsonResponse
from datetime import datetime, timedelta
import secrets

from django.contrib.auth import get_user_model, login, logout
from django.db import transaction
from django.db.models import Avg, Count, Max
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import permissions, status, viewsets
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework.parsers import FormParser, MultiPartParser

from .models import (
    AidProgram,
    AidRecommendation,
    Claim,
    Donation,
    DonorProfile,
    DonorTeamMember,
    FamilyProfile,
    LocationZone,
    Notification,
    VolunteerProfile,
    VolunteerTask,
    FoodInspection,
)
from .serializers import (
    AidProgramSerializer,
    AidRecommendationSerializer,
    ClaimManageSerializer,
    ClaimSerializer,
    ClaimStatusUpdateSerializer,
    DonationManageSerializer,
    DonationSerializer,
    DonorProfileSerializer,
    DonorTeamMemberSerializer,
    FamilyProfileSerializer,
    LocationZoneSerializer,
    NotificationSerializer,
    UserSerializer,
    VolunteerProfileSerializer,
    VolunteerTaskSerializer,
    FoodInspectionSerializer,
)
from .utils import analyze_food_image, normalize_role


User = get_user_model()
EMAIL_HOST_USER = "test@example.com"
CO2_PER_MILE = Decimal("0.404")


class IsDonor(permissions.BasePermission):
    message = "This endpoint is restricted to donor accounts."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "donor")


class IsVolunteer(permissions.BasePermission):
    message = "This endpoint is restricted to volunteer accounts."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "volunteer")


def _recalculate_donation_capacity(donation: Donation):
    active_claims = donation.claims.exclude(status="cancelled")
    remaining = max(donation.max_pickups - active_claims.count(), 0)
    donation.quantity = remaining
    if remaining > 0:
        if active_claims.filter(status="ready").exists():
            donation.status = "ready"
        elif active_claims.exists():
            donation.status = "reserved"
        else:
            donation.status = "available"
    else:
        if active_claims.filter(status="ready").exists():
            donation.status = "ready"
        elif active_claims.filter(status="collected").count() == active_claims.count() and active_claims.exists():
            donation.status = "collected"
        elif active_claims.exists():
            donation.status = "reserved"
        else:
            donation.status = "available"
    donation.save(update_fields=["quantity", "status", "updated_at"])


def _zone_priority(zone: LocationZone) -> int:
    weight = {"low": 3, "medium": 2, "high": 1}
    return weight.get(zone.level, 1) * max(zone.households_supported or 1, 1)


def _haversine_miles(coord_a: dict | None, coord_b: dict | None) -> float:
    if not coord_a or not coord_b:
        return 0.0
    lat1, lon1 = coord_a.get("latitude"), coord_a.get("longitude")
    lat2, lon2 = coord_b.get("latitude"), coord_b.get("longitude")
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return 0.0
    rlat1, rlon1, rlat2, rlon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = rlat2 - rlat1
    dlon = rlon2 - rlon1
    a = sin(dlat / 2) ** 2 + cos(rlat1) * cos(rlat2) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    earth_radius_miles = 3958.8
    return earth_radius_miles * c


def _compute_region_from_coords(points: list[dict[str, float]]) -> dict[str, float]:
    if not points:
        return {
            "latitude": 37.773972,
            "longitude": -122.431297,
            "latitude_delta": 0.2,
            "longitude_delta": 0.2,
        }
    lats = [p["latitude"] for p in points]
    lons = [p["longitude"] for p in points]
    min_lat, max_lat = min(lats), max(lats)
    min_lon, max_lon = min(lons), max(lons)
    latitude = (min_lat + max_lat) / 2
    longitude = (min_lon + max_lon) / 2
    latitude_delta = max((max_lat - min_lat) * 1.4, 0.05)
    longitude_delta = max((max_lon - min_lon) * 1.4, 0.05)
    return {
        "latitude": latitude,
        "longitude": longitude,
        "latitude_delta": latitude_delta,
        "longitude_delta": longitude_delta,
    }


def _build_donor_route_map(donations_qs):
    stops = []
    for donation in donations_qs.filter(status__in=["available", "ready"]).order_by("available_from"):
        zone = donation.location_zone
        if not zone or zone.latitude is None or zone.longitude is None:
            continue
        coords = {
            "latitude": float(zone.latitude),
            "longitude": float(zone.longitude),
        }
        stops.append(
            {
                "id": donation.id,
                "title": donation.title,
                "status": donation.status,
                "quantity": donation.quantity,
                "zone": zone.name,
                "coordinates": coords,
                "available_from": donation.available_from.isoformat() if donation.available_from else None,
                "available_until": donation.available_until.isoformat() if donation.available_until else None,
            }
        )

    if not stops:
        return {
            "stops": [],
            "polyline": [],
            "region": _compute_region_from_coords([]),
            "summary": {
                "total_distance_miles": 0,
                "estimated_duration_minutes": 0,
                "next_pickup": None,
            },
        }

    polyline = [stop["coordinates"] for stop in stops]
    total_distance = 0.0
    for idx in range(len(polyline) - 1):
        total_distance += _haversine_miles(polyline[idx], polyline[idx + 1])

    average_speed_mph = 18
    estimated_minutes = int(round((total_distance / average_speed_mph) * 60)) if total_distance else 0
    summary = {
        "total_distance_miles": round(total_distance, 2),
        "estimated_duration_minutes": estimated_minutes,
        "next_pickup": stops[0]["title"],
    }

    return {
        "stops": stops,
        "polyline": polyline,
        "region": _compute_region_from_coords(polyline),
        "summary": summary,
    }


def _generate_verification_code(length: int = 6) -> str:
    alphabet = "0123456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _get_or_create_donor_profile(user):
    profile, created = DonorProfile.objects.get_or_create(user=user)
    if created or not profile.contact_name:
        profile.contact_name = user.get_full_name() or user.email.split("@")[0]
        profile.save(update_fields=["contact_name", "updated_at"])
    return profile


def _serialize_donor_profile(user, profile: DonorProfile):
    team_members = profile.team_members.order_by("-status", "name")
    team_data = DonorTeamMemberSerializer(team_members, many=True).data
    donations_qs = Donation.objects.filter(created_by=user, is_prediction=False)
    claims_qs = Claim.objects.filter(donation__created_by=user)
    weekly_reservations = claims_qs.filter(reserved_at__gte=timezone.now() - timedelta(days=7)).count()

    return {
        "account": {
            "organization_name": profile.organization_name or user.get_full_name() or "Untitled donor",
            "contact_name": profile.contact_name or user.get_full_name() or user.email.split("@")[0],
            "contact_phone": profile.contact_phone,
            "email": user.email,
            "role": user.role,
            "member_since": user.date_joined,
        },
        "profile": DonorProfileSerializer(profile).data,
        "preferences": {
            "default_category": profile.default_category or "produce",
            "max_daily_pickups": profile.max_daily_pickups,
            "preferred_pickup_window": profile.preferred_pickup_window,
            "auto_confirm_ready": profile.auto_confirm_ready,
            "auto_publish_ai": profile.auto_publish_ai,
            "auto_assign_couriers": profile.auto_assign_couriers,
        },
        "notifications": {
            "notify_email": profile.notify_email,
            "notify_sms": profile.notify_sms,
            "notify_push": profile.notify_push,
            "digest_hour_local": profile.digest_hour_local,
            "quiet_hours_start": profile.quiet_hours_start,
            "quiet_hours_end": profile.quiet_hours_end,
            "enable_team_notifications": profile.enable_team_notifications,
        },
        "operations": {
            "next_pickup_at": profile.next_pickup_at,
            "volunteers_needed": profile.volunteers_needed,
            "upcoming_pickups": donations_qs.filter(status__in=["available", "ready"]).count(),
        },
        "team": {
            "members": team_data,
            "metrics": {
                "active": sum(1 for member in team_data if member["status"] == "active"),
                "invited": sum(1 for member in team_data if member["status"] == "invited"),
                "total": len(team_data),
            },
        },
        "integrations": [
            {
                "id": "calendar",
                "name": "Google Calendar",
                "connected": False,
                "description": "Sync pickup windows to your team calendar.",
            },
            {
                "id": "slack",
                "name": "Slack Alerts",
                "connected": profile.enable_team_notifications,
                "description": "Send ready-for-pickup alerts to #food-rescue.",
            },
        ],
        "activity": {
            "donations_created": donations_qs.count(),
            "ready_pickups": claims_qs.filter(status="ready").count(),
            "weekly_reservations": weekly_reservations,
        },
        "notes": profile.external_notes,
    }


def _get_or_create_volunteer_profile(user: User) -> VolunteerProfile:
    profile, _ = VolunteerProfile.objects.get_or_create(user=user)
    if not profile.badges:
        profile.badges = []
    if profile.rating is None:
        profile.rating = 5
    return profile

class UserViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = User.objects.all().order_by("-id")
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    authentication_classes = [TokenAuthentication]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["email"]


class SignupView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    http_method_names = ["post"]

    def post(self, request, *args, **kwargs):
        password = request.data.get("password")
        email = request.data.get("email")
        role = normalize_role(request.data.get("role"))

        if not (email and password):
            return Response({"error": "Email and password are required"}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(email=email).exists():
            return Response({"error": " email already taken"}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.create_user(email=email, password=password, role=role)
        normalized_role = normalize_role(user.role)
        if user.role != normalized_role:
            user.role = normalized_role
            user.save(update_fields=["role"])
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"email": user.email, "role": normalized_role, "token": token.key}, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        email = request.data.get("email")
        password = request.data.get("password")

        if not (email and password):
            return Response({"error": "email and password are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({"error": "Invalid email or password"}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.check_password(password):
            return Response({"error": "Invalid email or password"}, status=status.HTTP_401_UNAUTHORIZED)

        login(request, user)
        normalized_role = normalize_role(user.role)
        if user.role != normalized_role:
            user.role = normalized_role
            user.save(update_fields=["role"])
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"email": user.email, "role": normalized_role, "token": token.key})


@api_view(["POST"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def logout_view(request):
    auth_token = getattr(request, "auth", None)

    if isinstance(auth_token, Token):
        auth_token.delete()
    elif auth_token:
        Token.objects.filter(key=auth_token).delete()
    elif request.user.is_authenticated:
        Token.objects.filter(user=request.user).delete()

    logout(request)
    return JsonResponse({"message": "Logout successful"})


class MeView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        user = request.user
        normalized_role = normalize_role(getattr(user, "role", None))
        if user.role != normalized_role:
            user.role = normalized_role
            user.save(update_fields=["role"])
        serializer = UserSerializer(user)
        return Response(serializer.data)


class FoodInspectionView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, *args, **kwargs):
        queryset = FoodInspection.objects.filter(uploaded_by=request.user).order_by("-created_at")
        serializer = FoodInspectionSerializer(queryset, many=True, context={"request": request})
        return Response(serializer.data)

    def post(self, request, *args, **kwargs):
        image_file = request.FILES.get("image")
        if not image_file:
            return Response(
                {"error": "Image file is required. Provide it under the 'image' form key."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if hasattr(image_file, "seek"):
            try:
                image_file.seek(0)
            except (OSError, ValueError):
                pass

        inspection = FoodInspection.objects.create(uploaded_by=request.user, image=image_file)

        try:
            analysis = analyze_food_image(inspection.image.path)
        except RuntimeError as exc:
            inspection.status = FoodInspection.STATUS_FAILED
            inspection.error_message = str(exc)
            inspection.save(update_fields=["status", "error_message", "updated_at"])
            return Response(
                {"error": "Image analysis failed.", "details": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:  # noqa: BLE001 - bubble up message to client
            inspection.status = FoodInspection.STATUS_FAILED
            inspection.error_message = str(exc)
            inspection.save(update_fields=["status", "error_message", "updated_at"])
            return Response(
                {"error": "Image analysis failed.", "details": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        inspection.analysis = analysis
        inspection.status = FoodInspection.STATUS_SUCCEEDED
        inspection.error_message = ""
        inspection.save(update_fields=["analysis", "status", "error_message", "updated_at"])

        serializer = FoodInspectionSerializer(inspection, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class FoodInspectionDetailView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]

    def delete(self, request, pk: int, *args, **kwargs):
        inspection = get_object_or_404(FoodInspection, pk=pk, uploaded_by=request.user)
        inspection.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FamiliesDashboardView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        user = request.user
        zones = LocationZone.objects.all()[:6]
        zone_data = LocationZoneSerializer(zones, many=True).data

        quick_claims_qs = (
            Donation.objects.filter(status="available", is_prediction=False)
            .order_by("distance_miles", "-available_from")[:6]
        )
        quick_claims = DonationSerializer(quick_claims_qs, many=True).data

        notifications_qs = Notification.objects.filter(user=user).order_by("-scheduled_for")[:6]
        notifications = NotificationSerializer(notifications_qs, many=True).data

        predictions_qs = Donation.objects.filter(is_prediction=True).order_by("available_from")[:8]
        predictions = DonationSerializer(predictions_qs, many=True).data

        return Response(
            {
                "zones": zone_data,
                "quick_claims": quick_claims,
                "notifications": notifications,
                "coming_soon": predictions,
            }
        )


class FamiliesAvailableView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        category = request.query_params.get("category")
        live_qs = (
            Donation.objects.filter(is_prediction=False, status__in=["available", "ready"])
            .order_by("distance_miles")
        )
        predicted_qs = Donation.objects.filter(is_prediction=True).order_by("available_from")

        if category and category.lower() != "all":
            live_qs = live_qs.filter(category=category.lower())
            predicted_qs = predicted_qs.filter(category=category.lower())

        categories = Donation.CATEGORY_CHOICES
        zones = LocationZoneSerializer(LocationZone.objects.all()[:12], many=True).data

        return Response(
            {
                "categories": [
                    {
                        "value": "all",
                        "label": "All",
                    }
                ]
                + [
                    {
                        "value": choice[0],
                        "label": choice[1],
                    }
                    for choice in categories
                ],
                "live_inventory": DonationSerializer(live_qs, many=True).data,
                "predicted_inventory": DonationSerializer(predicted_qs, many=True).data,
                "zones": zones,
            }
        )


class FamiliesReserveView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]

    def post(self, request, *args, **kwargs):
        donation_id = request.data.get("donation_id")
        if not donation_id:
            return Response({"error": "donation_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            donation_id = int(donation_id)
        except (TypeError, ValueError):
            return Response({"error": "donation_id must be a valid integer"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                donation = Donation.objects.select_for_update().get(pk=donation_id, is_prediction=False)
                if donation.status not in ["available", "ready"]:
                    return Response({"error": "This donation is no longer available."}, status=status.HTTP_409_CONFLICT)

                if donation.remaining_pickups <= 0:
                    return Response({"error": "All pickup slots have been filled."}, status=status.HTTP_409_CONFLICT)

                existing_claim = (
                    Claim.objects.select_for_update()
                    .filter(
                        user=request.user,
                        donation=donation,
                    )
                    .exclude(status="cancelled")
                    .first()
                )
                if existing_claim:
                    serializer = ClaimSerializer(existing_claim)
                    return Response(serializer.data, status=status.HTTP_200_OK)

                verification_code = _generate_verification_code()
                claim = Claim.objects.create(
                    user=request.user,
                    donation=donation,
                    status="reserved",
                    reserved_at=timezone.now(),
                    verification_code=verification_code,
                )

                if donation.quantity > 0:
                    donation.quantity = max(donation.quantity - 1, 0)
                else:
                    donation.quantity = max(
                        donation.max_pickups - donation.claims.exclude(status="cancelled").count(),
                        0,
                    )

                if donation.quantity <= 0:
                    donation.status = "reserved"
                elif donation.status not in ["ready", "available"]:
                    donation.status = "reserved"
            def _ensure_sample_volunteer_tasks():
                if VolunteerTask.objects.exists():
                    return

                sample_tasks = [
                    {
                        "title": "Downtown bakery pickup",
                        "summary": "Collect bread trays and deliver to Tenderloin pantry",
                        "urgency": "high",
                        "load_size": "medium",
                        "distance": Decimal("6.4"),
                        "minutes": 28,
                        "pickup": "Sunrise Bakery, 1024 Mission St",
                        "pickup_lat": Decimal("37.781"),
                        "pickup_lng": Decimal("-122.410"),
                        "dropoff": "Tenderloin Community Pantry, 201 Turk St",
                        "drop_lat": Decimal("37.782"),
                        "drop_lng": Decimal("-122.414"),
                    },
                    {
                        "title": "Farmers market donation",
                        "summary": "Boxed produce headed to Bayview families",
                        "urgency": "medium",
                        "load_size": "large",
                        "distance": Decimal("11.2"),
                        "minutes": 36,
                        "pickup": "Ferry Plaza Farmers Market",
                        "pickup_lat": Decimal("37.795"),
                        "pickup_lng": Decimal("-122.394"),
                        "dropoff": "Bayview Family Hub, 1550 Evans Ave",
                        "drop_lat": Decimal("37.742"),
                        "drop_lng": Decimal("-122.387"),
                    },
                    {
                        "title": "Prepared meals sprint",
                        "summary": "Urgent hot meal delivery to SOMA shelter",
                        "urgency": "critical",
                        "load_size": "small",
                        "distance": Decimal("3.8"),
                        "minutes": 16,
                        "pickup": "Harvest Kitchen, 455 6th St",
                        "pickup_lat": Decimal("37.776"),
                        "pickup_lng": Decimal("-122.404"),
                        "dropoff": "SOMA Safe Haven, 100 10th St",
                        "drop_lat": Decimal("37.777"),
                        "drop_lng": Decimal("-122.414"),
                    },
                ]

                for order, task in enumerate(sample_tasks, start=1):
                    VolunteerTask.objects.create(
                        title=task["title"],
                        summary=task["summary"],
                        urgency=task["urgency"],
                        load_size=task["load_size"],
                        distance_miles=task["distance"],
                        estimated_minutes=task["minutes"],
                        pickup_address=task["pickup"],
                        pickup_latitude=task["pickup_lat"],
                        pickup_longitude=task["pickup_lng"],
                        dropoff_address=task["dropoff"],
                        dropoff_latitude=task["drop_lat"],
                        dropoff_longitude=task["drop_lng"],
                        efficiency_score=Decimal("88.0") - Decimal(order),
                        route_sequence=order,
                    )

                donation.save(update_fields=["quantity", "status", "updated_at"])

        except Donation.DoesNotExist:
            return Response({"error": "Donation not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = ClaimSerializer(claim)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class FamiliesClaimsView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        user = request.user
        claims = Claim.objects.filter(user=user).select_related("donation")

        reserved = claims.filter(status="reserved")
        ready = claims.filter(status="ready")
        history = claims.filter(status="collected")

        return Response(
            {
                "reserved": ClaimSerializer(reserved, many=True).data,
                "active": ClaimSerializer(ready, many=True).data,
                "history": ClaimSerializer(history, many=True).data,
            }
        )


class FamiliesAidView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        user = request.user
        programs = AidProgramSerializer(AidProgram.objects.all(), many=True).data
        recommendations = AidRecommendationSerializer(
            AidRecommendation.objects.filter(user=user)[:5], many=True
        ).data

        support = {
            "chat_hours": "Weekdays 9am – 6pm",
            "languages": ["English", "Spanish"],
            "document_storage_days": 60,
        }

        return Response(
            {
                "programs": programs,
                "recommendations": recommendations,
                "support": support,
            }
        )


class FamiliesProfileView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        user = request.user
        profile, _ = FamilyProfile.objects.get_or_create(user=user)

        impact = {
            "meals_received": sum(
                claim.donation.quantity for claim in user.claims.filter(status="collected")
            ),
            "co2_saved_lbs": round(user.claims.filter(status="collected").count() * 3.3, 1),
            "volunteer_hours": 6,
        }

        return Response(
            {
                "profile": FamilyProfileSerializer(profile).data,
                "impact": impact,
            }
        )


class DonorProfileView(APIView):
    permission_classes = [IsAuthenticated, IsDonor]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        profile = _get_or_create_donor_profile(request.user)
        payload = _serialize_donor_profile(request.user, profile)
        return Response(payload)

    def patch(self, request, *args, **kwargs):
        profile = _get_or_create_donor_profile(request.user)
        data = request.data or {}
        account_data = data.get("account") or {}
        preferences_data = data.get("preferences") or {}
        notifications_data = data.get("notifications") or {}
        operations_data = data.get("operations") or {}
        notes = data.get("notes")

        updated_fields = []

        if "organization_name" in account_data:
            profile.organization_name = account_data["organization_name"] or ""
            updated_fields.append("organization_name")
        if "contact_name" in account_data:
            profile.contact_name = account_data["contact_name"] or ""
            updated_fields.append("contact_name")
        if "contact_phone" in account_data:
            profile.contact_phone = account_data["contact_phone"] or ""
            updated_fields.append("contact_phone")

        if "default_category" in preferences_data:
            value = preferences_data["default_category"]
            valid_categories = [choice[0] for choice in Donation.CATEGORY_CHOICES]
            if value and value not in valid_categories:
                return Response({"detail": "Invalid default_category"}, status=status.HTTP_400_BAD_REQUEST)
            profile.default_category = value or ""
            updated_fields.append("default_category")
        if "max_daily_pickups" in preferences_data:
            try:
                max_daily = int(preferences_data["max_daily_pickups"])
            except (TypeError, ValueError):
                return Response({"detail": "max_daily_pickups must be an integer"}, status=status.HTTP_400_BAD_REQUEST)
            if max_daily <= 0:
                return Response({"detail": "max_daily_pickups must be positive"}, status=status.HTTP_400_BAD_REQUEST)
            profile.max_daily_pickups = max_daily
            updated_fields.append("max_daily_pickups")
        if "preferred_pickup_window" in preferences_data:
            try:
                window_minutes = int(preferences_data["preferred_pickup_window"])
            except (TypeError, ValueError):
                return Response({"detail": "preferred_pickup_window must be an integer"}, status=status.HTTP_400_BAD_REQUEST)
            if window_minutes < 15:
                return Response({"detail": "preferred_pickup_window must be at least 15 minutes"}, status=status.HTTP_400_BAD_REQUEST)
            profile.preferred_pickup_window = window_minutes
            updated_fields.append("preferred_pickup_window")
        for boolean_field in ["auto_confirm_ready", "auto_publish_ai", "auto_assign_couriers"]:
            if boolean_field in preferences_data:
                setattr(profile, boolean_field, bool(preferences_data[boolean_field]))
                updated_fields.append(boolean_field)

        for boolean_field in ["notify_email", "notify_sms", "notify_push", "enable_team_notifications"]:
            if boolean_field in notifications_data:
                setattr(profile, boolean_field, bool(notifications_data[boolean_field]))
                updated_fields.append(boolean_field)
        if "digest_hour_local" in notifications_data:
            try:
                digest_hour = int(notifications_data["digest_hour_local"])
            except (TypeError, ValueError):
                return Response({"detail": "digest_hour_local must be an integer"}, status=status.HTTP_400_BAD_REQUEST)
            if not 0 <= digest_hour <= 23:
                return Response(
                    {"detail": "digest_hour_local must be between 0 and 23"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            profile.digest_hour_local = digest_hour
            updated_fields.append("digest_hour_local")
        if "quiet_hours_start" in notifications_data:
            start_value = notifications_data["quiet_hours_start"] or "21:00"
            if len(start_value) != 5 or start_value[2] != ":":
                return Response({"detail": "quiet_hours_start must be formatted HH:MM"}, status=status.HTTP_400_BAD_REQUEST)
            profile.quiet_hours_start = start_value
            updated_fields.append("quiet_hours_start")
        if "quiet_hours_end" in notifications_data:
            end_value = notifications_data["quiet_hours_end"] or "06:00"
            if len(end_value) != 5 or end_value[2] != ":":
                return Response({"detail": "quiet_hours_end must be formatted HH:MM"}, status=status.HTTP_400_BAD_REQUEST)
            profile.quiet_hours_end = end_value
            updated_fields.append("quiet_hours_end")

        if "next_pickup_at" in operations_data:
            raw_next = operations_data["next_pickup_at"]
            if raw_next:
                if isinstance(raw_next, datetime):
                    parsed = raw_next
                elif isinstance(raw_next, (int, float)):
                    parsed = datetime.fromtimestamp(raw_next, tz=timezone.utc)
                else:
                    parsed = parse_datetime(str(raw_next))
                if parsed is None:
                    return Response(
                        {"detail": "next_pickup_at must be a valid ISO 8601 datetime"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if timezone.is_naive(parsed):
                    parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
                profile.next_pickup_at = parsed
            else:
                profile.next_pickup_at = None
            updated_fields.append("next_pickup_at")

        if "volunteers_needed" in operations_data:
            try:
                volunteers_needed = int(operations_data["volunteers_needed"])
            except (TypeError, ValueError):
                return Response(
                    {"detail": "volunteers_needed must be an integer"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if volunteers_needed < 0:
                return Response(
                    {"detail": "volunteers_needed must be zero or greater"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            profile.volunteers_needed = volunteers_needed
            updated_fields.append("volunteers_needed")

        if notes is not None:
            profile.external_notes = notes or ""
            updated_fields.append("external_notes")

        if updated_fields:
            updated_fields.append("updated_at")
            profile.save(update_fields=list(dict.fromkeys(updated_fields)))

        payload = _serialize_donor_profile(request.user, profile)
        return Response(payload)


class DonorTeamCollectionView(APIView):
    permission_classes = [IsAuthenticated, IsDonor]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        profile = _get_or_create_donor_profile(request.user)
        members = profile.team_members.order_by("name")
        serializer = DonorTeamMemberSerializer(members, many=True)
        return Response({"members": serializer.data})

    def post(self, request, *args, **kwargs):
        profile = _get_or_create_donor_profile(request.user)
        name = request.data.get("name")
        email = request.data.get("email")
        role = request.data.get("role") or "collaborator"
        permissions_list = request.data.get("permissions") or []

        if not (name and email):
            return Response({"detail": "name and email are required"}, status=status.HTTP_400_BAD_REQUEST)

        member = DonorTeamMember.objects.create(
            profile=profile,
            name=name,
            email=email,
            role=role,
            status="invited",
            permissions=permissions_list,
        )
        serializer = DonorTeamMemberSerializer(member)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class DonorTeamMemberDetailView(APIView):
    permission_classes = [IsAuthenticated, IsDonor]
    authentication_classes = [TokenAuthentication]

    def get_object(self, request, pk):
        profile = _get_or_create_donor_profile(request.user)
        try:
            return profile.team_members.get(pk=pk)
        except DonorTeamMember.DoesNotExist as exc:
            raise NotFound("Team member not found") from exc

    def patch(self, request, pk, *args, **kwargs):
        member = self.get_object(request, pk)
        data = request.data or {}

        if "status" in data:
            status_value = data["status"]
            valid_statuses = [choice[0] for choice in DonorTeamMember.STATUS_CHOICES]
            if status_value not in valid_statuses:
                return Response({"detail": "Invalid status value"}, status=status.HTTP_400_BAD_REQUEST)
            member.status = status_value
        if "role" in data:
            member.role = data["role"] or member.role
        if "permissions" in data:
            member.permissions = data["permissions"] or []
        if data.get("touch_activity"):
            member.last_active_at = timezone.now()
        member.save(update_fields=["status", "role", "permissions", "last_active_at", "updated_at"])
        serializer = DonorTeamMemberSerializer(member)
        return Response(serializer.data)

    def delete(self, request, pk, *args, **kwargs):
        member = self.get_object(request, pk)
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DonorDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsDonor]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        user = request.user
        now = timezone.now()
        today = now.date()
        donations_qs = Donation.objects.filter(created_by=user, is_prediction=False).select_related("location_zone")
        claims_qs = Claim.objects.filter(donation__created_by=user).select_related("donation", "user")

        active_donations = donations_qs.filter(status__in=["available", "ready"]).count()
        reservations_today = claims_qs.filter(reserved_at__date=today).count()
        ready_pickups = claims_qs.filter(status="ready").count()
        collected_total = claims_qs.filter(status="collected").count()
        meals_provided = collected_total * 4
        co2_saved = round(collected_total * 5.5, 1)
        freshness_score = max(
            65,
            min(98, int(100 - (donations_qs.aggregate(avg=Avg("distance_miles"))["avg"] or 0) * 8)),
        )

        zones = list(LocationZone.objects.all())
        prioritized_zones = sorted(zones, key=_zone_priority, reverse=True)[:3]

        smart_suggestions = []
        if prioritized_zones:
            top_zone = prioritized_zones[0]
            smart_suggestions.append(f"Donate produce today — high demand in {top_zone.name}")
        if ready_pickups:
            smart_suggestions.append(
                f"{ready_pickups} pickups are marked ready — confirm courier assignments"
            )
        trailing_donation = donations_qs.filter(status="available").order_by("available_from").first()
        if trailing_donation:
            smart_suggestions.append(
                f"Open reservations for {trailing_donation.title} earlier to avoid evening rush"
            )

        current_events = []
        for donation in donations_qs.order_by("-available_from")[:6]:
            claims_for_donation = claims_qs.filter(donation=donation)
            next_ready = (
                claims_for_donation.filter(pickup_window_start__isnull=False)
                .order_by("pickup_window_start")
                .first()
            )
            current_events.append(
                {
                    "id": donation.id,
                    "title": donation.title,
                    "status": donation.status,
                    "max_pickups": donation.max_pickups,
                    "reserved": claims_for_donation.exclude(status="cancelled").count(),
                    "remaining": donation.remaining_pickups,
                    "zone": donation.location_zone.name if donation.location_zone else None,
                    "next_pickup_window": next_ready.pickup_window_start if next_ready else None,
                }
            )

        route_map = _build_donor_route_map(donations_qs)

        data = {
            "overview": {
                "active_donations": active_donations,
                "reservations_today": reservations_today,
                "ready_pickups": ready_pickups,
            },
            "smart_suggestions": smart_suggestions,
            "impact_summary": {
                "meals_provided": meals_provided,
                "co2_saved_lbs": co2_saved,
                "freshness_score": freshness_score,
            },
            "current_events": current_events,
            "route_map": route_map,
        }

        return Response(data)


class DonorDonationsView(APIView):
    permission_classes = [IsAuthenticated, IsDonor]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        user = request.user
        donations = Donation.objects.filter(created_by=user, is_prediction=False).select_related(
            "location_zone"
        )
        serializer = DonationSerializer(donations, many=True)
        categories = [{"value": value, "label": label} for value, label in Donation.CATEGORY_CHOICES]
        zones = LocationZoneSerializer(LocationZone.objects.all().order_by("name"), many=True).data
        return Response(
            {
                "donations": serializer.data,
                "meta": {
                    "categories": categories,
                    "zones": zones,
                },
            }
        )

    def post(self, request, *args, **kwargs):
        user = request.user
        payload = request.data.copy()
        if not payload.get("donor_name"):
            payload["donor_name"] = user.get_full_name() or user.email
        serializer = DonationManageSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        donation = serializer.save(created_by=user, is_prediction=False)
        donation.quantity = donation.max_pickups
        donation.save(update_fields=["quantity", "updated_at"])
        return Response(DonationSerializer(donation).data, status=status.HTTP_201_CREATED)


class DonorDonationDetailView(APIView):
    permission_classes = [IsAuthenticated, IsDonor]
    authentication_classes = [TokenAuthentication]

    def get_object(self, request, pk):
        try:
            return Donation.objects.get(pk=pk, created_by=request.user)
        except Donation.DoesNotExist as exc:
            raise NotFound("Donation not found or not accessible.") from exc

    def get(self, request, pk, *args, **kwargs):
        donation = self.get_object(request, pk)
        return Response(DonationSerializer(donation).data)

    def patch(self, request, pk, *args, **kwargs):
        donation = self.get_object(request, pk)
        serializer = DonationManageSerializer(donation, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        _recalculate_donation_capacity(donation)
        donation.refresh_from_db()
        return Response(DonationSerializer(donation).data)


class DonorDonationClaimsView(APIView):
    permission_classes = [IsAuthenticated, IsDonor]
    authentication_classes = [TokenAuthentication]

    def get(self, request, pk, *args, **kwargs):
        donation = Donation.objects.filter(pk=pk, created_by=request.user).first()
        if not donation:
            return Response({"detail": "Donation not found"}, status=status.HTTP_404_NOT_FOUND)
        claims = donation.claims.select_related("user", "donation")
        return Response(
            {
                "donation": DonationSerializer(donation).data,
                "claims": ClaimManageSerializer(claims, many=True).data,
            }
        )


class DonorClaimStatusUpdateView(APIView):
    permission_classes = [IsAuthenticated, IsDonor]
    authentication_classes = [TokenAuthentication]

    def patch(self, request, pk, *args, **kwargs):
        try:
            claim = Claim.objects.select_related("donation", "user").get(
                pk=pk, donation__created_by=request.user
            )
        except Claim.DoesNotExist:
            return Response({"detail": "Reservation not found"}, status=status.HTTP_404_NOT_FOUND)

        serializer = ClaimStatusUpdateSerializer(claim, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        _recalculate_donation_capacity(claim.donation)
        claim.refresh_from_db()
        return Response(ClaimManageSerializer(claim).data)


class DonorAnalyticsView(APIView):
    permission_classes = [IsAuthenticated, IsDonor]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        user = request.user
        claims = Claim.objects.filter(donation__created_by=user)
        donations = Donation.objects.filter(created_by=user)

        weekly_data = []
        for weeks_back in range(0, 6):
            start = timezone.now().date() - timedelta(weeks=weeks_back + 1)
            end = timezone.now().date() - timedelta(weeks=weeks_back)
            window_claims = claims.filter(
                reserved_at__date__gt=start, reserved_at__date__lte=end
            )
            weekly_data.append(
                {
                    "label": f"Week {weeks_back + 1}",
                    "reservations": window_claims.count(),
                    "collected": window_claims.filter(status="collected").count(),
                }
            )

        category_mix = donations.values("category").annotate(total=Count("id")).order_by("-total")

        spoilage_risk = max(
            0,
            min(
                100,
                100
                - int(
                    donations.filter(status="collected").count()
                    / (donations.count() or 1)
                    * 100
                ),
            ),
        )

        tips = [
            "Your dairy donations often go unused after 2 days. Consider earlier drop-offs.",
            "Offer smaller pickup windows for prepared meals to keep freshness high.",
            "Schedule volunteers in advance for Friday evening surges.",
        ]

        return Response(
            {
                "weekly_trends": list(reversed(weekly_data)),
                "category_mix": [
                    {
                        "category": dict(Donation.CATEGORY_CHOICES).get(
                            item["category"], item["category"]
                        ),
                        "count": item["total"],
                    }
                    for item in category_mix
                ],
                "spoilage_risk_score": spoilage_risk,
                "ai_tips": tips,
            }
        )


class DonorImpactView(APIView):
    permission_classes = [IsAuthenticated, IsDonor]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        user = request.user
        claims = Claim.objects.filter(donation__created_by=user)
        total_meals = claims.filter(status="collected").count() * 4
        leaderboards = [
            {"rank": 1, "name": "Harborview Grocers", "meals": 820},
            {"rank": 2, "name": "Sunrise Farms", "meals": 760},
            {
                "rank": 3,
                "name": user.get_full_name() or user.email,
                "meals": max(total_meals, 120),
            },
        ]

        impact_tree = {
            "tiers": [
                {"name": "Seedling", "threshold": 50, "achieved": total_meals >= 50},
                {"name": "Bloom", "threshold": 200, "achieved": total_meals >= 200},
                {
                    "name": "Harvest Champion",
                    "threshold": 500,
                    "achieved": total_meals >= 500,
                },
            ],
            "current": total_meals,
        }

        badges = [
            {"label": "First 100 Meals", "earned": total_meals >= 100},
            {
                "label": "Zero Waste Week",
                "earned": claims.filter(status="cancelled").count() == 0,
            },
            {
                "label": "Freshness Hero",
                "earned": claims.filter(status="collected").count() >= 20,
            },
        ]

        return Response(
            {
                "leaderboard": leaderboards,
                "impact_tree": impact_tree,
                "badges": badges,
            }
        )


class DonorAutoRouteView(APIView):
    permission_classes = [IsAuthenticated, IsDonor]
    authentication_classes = [TokenAuthentication]

    def post(self, request, *args, **kwargs):
        donation_id = request.data.get("donation_id")
        donation = None
        if donation_id:
            donation = (
                Donation.objects.filter(pk=donation_id, created_by=request.user)
                .select_related("location_zone")
                .first()
            )

        zones = LocationZone.objects.all()
        if not zones:
            return Response({"detail": "No partner zones configured yet."}, status=status.HTTP_404_NOT_FOUND)

        if donation and donation.location_zone:
            origin_zone = donation.location_zone
        else:
            origin_zone = zones.order_by("-households_supported").first()

        prioritized = sorted(zones, key=_zone_priority, reverse=True)
        target_zone = prioritized[0]

        route = {
            "origin": origin_zone.name,
            "destination": target_zone.name,
            "estimated_minutes": 18 if origin_zone == target_zone else 24,
            "instructions": [
                "Prep donation crates and confirm temperature logs",
                f"Assign courier to {target_zone.name}",
                f"Notify pantry lead at {target_zone.name} of incoming delivery",
            ],
        }

        return Response(route)


class VolunteerRoutesView(APIView):
    permission_classes = [IsAuthenticated, IsVolunteer]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        user = request.user
        profile = _get_or_create_volunteer_profile(user)

        _ensure_sample_volunteer_tasks()

        active_tasks = list(
            VolunteerTask.objects.filter(volunteer=user)
            .exclude(status__in=["completed", "cancelled"])
            .order_by("route_sequence", "scheduled_start", "id")
        )

        if not active_tasks:
            suggestions = VolunteerTask.objects.filter(status="open").order_by("urgency", "distance_miles")[:5]
            return Response(
                {
                    "profile": VolunteerProfileSerializer(profile).data,
                    "route": None,
                    "suggestions": VolunteerTaskSerializer(suggestions, many=True).data,
                }
            )

        stops = []
        polyline = []
        total_distance = 0.0
        total_minutes = 0
        efficiency_scores = []

        for task in active_tasks:
            pickup_lat = float(task.pickup_latitude) if task.pickup_latitude is not None else None
            pickup_lng = float(task.pickup_longitude) if task.pickup_longitude is not None else None
            drop_lat = float(task.dropoff_latitude) if task.dropoff_latitude is not None else None
            drop_lng = float(task.dropoff_longitude) if task.dropoff_longitude is not None else None

            total_distance += float(task.distance_miles or 0)
            total_minutes += int(task.estimated_minutes or 0)
            if task.efficiency_score is not None:
                efficiency_scores.append(float(task.efficiency_score))

            stops.append(
                {
                    "id": f"{task.id}-pickup",
                    "task_id": task.id,
                    "type": "pickup",
                    "label": task.pickup_address,
                    "status": task.status,
                    "sequence": len(stops) + 1,
                    "eta_minutes": task.estimated_minutes,
                    "coordinates": {"latitude": pickup_lat, "longitude": pickup_lng},
                }
            )
            if pickup_lat is not None and pickup_lng is not None:
                polyline.append({"latitude": pickup_lat, "longitude": pickup_lng})

            stops.append(
                {
                    "id": f"{task.id}-dropoff",
                    "task_id": task.id,
                    "type": "dropoff",
                    "label": task.dropoff_address,
                    "status": task.status,
                    "sequence": len(stops) + 1,
                    "eta_minutes": task.estimated_minutes,
                    "coordinates": {"latitude": drop_lat, "longitude": drop_lng},
                }
            )
            if drop_lat is not None and drop_lng is not None:
                polyline.append({"latitude": drop_lat, "longitude": drop_lng})

        avg_efficiency = (
            round(sum(efficiency_scores) / len(efficiency_scores), 2) if efficiency_scores else float(profile.efficiency_score or 0)
        )

        data = {
            "profile": VolunteerProfileSerializer(profile).data,
            "route": {
                "summary": {
                    "total_distance_miles": round(total_distance, 2),
                    "eta_minutes": total_minutes,
                    "efficiency_score": avg_efficiency,
                    "last_updated": timezone.now(),
                },
                "polyline": polyline,
                "stops": stops,
                "tasks": VolunteerTaskSerializer(active_tasks, many=True).data,
            },
        }
        return Response(data)


class VolunteerAvailableTasksView(APIView):
    permission_classes = [IsAuthenticated, IsVolunteer]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        _ensure_sample_volunteer_tasks()

        qs = VolunteerTask.objects.filter(status="open").order_by("urgency", "distance_miles")

        max_distance = request.query_params.get("max_distance")
        urgency = request.query_params.get("urgency")
        load_size = request.query_params.get("load")

        if max_distance:
            try:
                max_distance_value = float(max_distance)
                qs = qs.filter(distance_miles__lte=max_distance_value)
            except (TypeError, ValueError):
                return Response({"detail": "max_distance must be numeric"}, status=status.HTTP_400_BAD_REQUEST)
        if urgency:
            qs = qs.filter(urgency=urgency)
        if load_size:
            qs = qs.filter(load_size=load_size)

        serializer = VolunteerTaskSerializer(qs, many=True)
        return Response(
            {
                "count": qs.count(),
                "results": serializer.data,
                "filters": {
                    "max_distance": max_distance,
                    "urgency": urgency,
                    "load": load_size,
                },
            }
        )


class VolunteerAcceptTaskView(APIView):
    permission_classes = [IsAuthenticated, IsVolunteer]
    authentication_classes = [TokenAuthentication]

    def post(self, request, *args, **kwargs):
        task_id = request.data.get("task_id")
        if not task_id:
            return Response({"detail": "task_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            task_id = int(task_id)
        except (TypeError, ValueError):
            return Response({"detail": "task_id must be an integer"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            try:
                task = VolunteerTask.objects.select_for_update().get(pk=task_id)
            except VolunteerTask.DoesNotExist:
                return Response({"detail": "Task not found"}, status=status.HTTP_404_NOT_FOUND)

            if task.volunteer and task.volunteer != request.user:
                return Response({"detail": "Task already assigned"}, status=status.HTTP_409_CONFLICT)
            if task.status not in ["open", "assigned"]:
                return Response({"detail": "Task is not available"}, status=status.HTTP_409_CONFLICT)

            profile = _get_or_create_volunteer_profile(request.user)

            max_sequence = (
                VolunteerTask.objects.filter(volunteer=request.user)
                .aggregate(max_route=Max("route_sequence"))
                .get("max_route")
                or 0
            )

            if not task.route_sequence:
                task.route_sequence = max_sequence + 1

            task.volunteer = request.user
            task.status = "assigned"
            task.auto_assigned_at = timezone.now()
            task.save(update_fields=[
                "volunteer",
                "status",
                "route_sequence",
                "auto_assigned_at",
                "updated_at",
            ])

            task_efficiency = float(task.efficiency_score or 0)
            profile_efficiency = float(profile.efficiency_score or 0)
            if task_efficiency:
                if profile_efficiency:
                    profile.efficiency_score = Decimal(str(round((profile_efficiency + task_efficiency) / 2, 2)))
                else:
                    profile.efficiency_score = Decimal(str(round(task_efficiency, 2)))
                profile.save(update_fields=["efficiency_score", "updated_at"])

        return Response(VolunteerTaskSerializer(task).data, status=status.HTTP_200_OK)


class VolunteerActiveDeliveriesView(APIView):
    permission_classes = [IsAuthenticated, IsVolunteer]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        statuses = ["assigned", "en_route", "picked_up", "delivering"]
        tasks = VolunteerTask.objects.filter(volunteer=request.user, status__in=statuses).order_by(
            "route_sequence", "scheduled_start", "id"
        )
        return Response({"results": VolunteerTaskSerializer(tasks, many=True).data})


class VolunteerTaskStatusView(APIView):
    permission_classes = [IsAuthenticated, IsVolunteer]
    authentication_classes = [TokenAuthentication]

    def post(self, request, *args, **kwargs):
        task_id = request.data.get("task_id")
        new_status = request.data.get("status")
        photo_url = request.data.get("completion_photo_url")

        if not (task_id and new_status):
            return Response({"detail": "task_id and status are required"}, status=status.HTTP_400_BAD_REQUEST)

        valid_statuses = {choice[0] for choice in VolunteerTask.STATUS_CHOICES}
        if new_status not in valid_statuses:
            return Response({"detail": "Invalid status value"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            task = VolunteerTask.objects.get(pk=task_id, volunteer=request.user)
        except VolunteerTask.DoesNotExist:
            return Response({"detail": "Task not found"}, status=status.HTTP_404_NOT_FOUND)

        task.status = new_status
        update_fields = ["status", "updated_at"]

        if photo_url is not None:
            task.completion_photo_url = photo_url
            update_fields.append("completion_photo_url")

        if new_status == "completed":
            task.completed_at = timezone.now()
            update_fields.append("completed_at")

            profile = _get_or_create_volunteer_profile(request.user)
            distance_value = task.distance_miles or Decimal("0")
            profile.miles_driven = (profile.miles_driven or Decimal("0")) + distance_value
            profile.miles_driven = profile.miles_driven.quantize(Decimal("0.01"))
            profile.meals_delivered = profile.meals_delivered + 30
            profile.co2_saved_kg = (profile.co2_saved_kg or Decimal("0")) + (distance_value * CO2_PER_MILE)
            profile.co2_saved_kg = profile.co2_saved_kg.quantize(Decimal("0.01"))
            badges = set(profile.badges or [])
            if profile.meals_delivered >= 120:
                badges.add("Route Hero")
            if profile.co2_saved_kg >= 50:
                badges.add("Freshness Guardian")
            profile.badges = sorted(badges)
            profile.save(update_fields=[
                "miles_driven",
                "meals_delivered",
                "co2_saved_kg",
                "badges",
                "updated_at",
            ])

        task.save(update_fields=update_fields)
        return Response(VolunteerTaskSerializer(task).data)


class VolunteerImpactView(APIView):
    permission_classes = [IsAuthenticated, IsVolunteer]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        user = request.user
        profile = _get_or_create_volunteer_profile(user)
        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        monthly_tasks = VolunteerTask.objects.filter(
            volunteer=user,
            completed_at__gte=month_start,
        )

        miles_decimal = sum(((task.distance_miles or Decimal("0")) for task in monthly_tasks), Decimal("0"))
        miles_decimal = miles_decimal.quantize(Decimal("0.01")) if miles_decimal else Decimal("0.00")
        meals = monthly_tasks.count() * 30
        co2_decimal = (miles_decimal * CO2_PER_MILE).quantize(Decimal("0.01")) if miles_decimal else Decimal("0.00")

        leaderboard = [
            {
                "name": vp.user.get_full_name() or vp.user.email,
                "efficiency_score": float(vp.efficiency_score or 0),
                "meals_delivered": vp.meals_delivered,
            }
            for vp in VolunteerProfile.objects.select_related("user").order_by("-efficiency_score", "-meals_delivered")[:10]
        ]

        badges = profile.badges or []
        if meals >= 120 and "Route Hero" not in badges:
            badges = sorted(set(list(badges) + ["Route Hero"]))
            profile.badges = badges
            profile.save(update_fields=["badges", "updated_at"])

        summary = {
            "month_label": now.strftime("%B %Y"),
            "meals_delivered": meals,
            "miles_driven": float(miles_decimal),
            "co2_saved_kg": float(co2_decimal),
            "efficiency_score": float(profile.efficiency_score or 0),
        }

        streak = VolunteerTask.objects.filter(volunteer=user, status="completed").order_by("-completed_at")[:30]
        streak_days = len({entry.completed_at.date() for entry in streak if entry.completed_at})

        return Response(
            {
                "summary": summary,
                "leaderboard": leaderboard,
                "badges": badges,
                "streak_days": streak_days,
            }
        )


class VolunteerProfileView(APIView):
    permission_classes = [IsAuthenticated, IsVolunteer]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        profile = _get_or_create_volunteer_profile(request.user)
        serializer = VolunteerProfileSerializer(profile)
        return Response(serializer.data)

    def patch(self, request, *args, **kwargs):
        profile = _get_or_create_volunteer_profile(request.user)
        serializer = VolunteerProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


