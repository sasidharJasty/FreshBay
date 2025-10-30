from __future__ import annotations

from collections import Counter
import json
import logging
import random
import secrets
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from math import atan2, cos, radians, sin, sqrt
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.templatetags.static import static
from django.utils.formats import date_format
from django.views.generic import TemplateView
from django.contrib.auth import get_user_model, login, logout
from django.contrib.auth.models import Group
from django.core.exceptions import ObjectDoesNotExist
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Avg, Count, Max, Sum, Q
from django.db.models.functions import TruncDate
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import permissions, status, viewsets
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

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
    FoodInsecurityForecast,
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
    FoodInsecurityForecastSerializer,
)
from .ml.seq2seq_food_insecurity import (
    ForecastConfig,
    dataframe_to_forecast_rows,
    run_food_insecurity_forecast,
)

from .utils import analyze_food_image, normalize_role


logger = logging.getLogger(__name__)


User = get_user_model()
EMAIL_HOST_USER = "test@example.com"
CO2_PER_MILE = Decimal("0.404")

_STATE_ABBR_TO_NAME = {
    "AL": "Alabama",
    "AK": "Alaska",
    "AZ": "Arizona",
    "AR": "Arkansas",
    "CA": "California",
    "CO": "Colorado",
    "CT": "Connecticut",
    "DE": "Delaware",
    "DC": "District of Columbia",
    "FL": "Florida",
    "GA": "Georgia",
    "HI": "Hawaii",
    "ID": "Idaho",
    "IL": "Illinois",
    "IN": "Indiana",
    "IA": "Iowa",
    "KS": "Kansas",
    "KY": "Kentucky",
    "LA": "Louisiana",
    "ME": "Maine",
    "MD": "Maryland",
    "MA": "Massachusetts",
    "MI": "Michigan",
    "MN": "Minnesota",
    "MS": "Mississippi",
    "MO": "Missouri",
    "MT": "Montana",
    "NE": "Nebraska",
    "NV": "Nevada",
    "NH": "New Hampshire",
    "NJ": "New Jersey",
    "NM": "New Mexico",
    "NY": "New York",
    "NC": "North Carolina",
    "ND": "North Dakota",
    "OH": "Ohio",
    "OK": "Oklahoma",
    "OR": "Oregon",
    "PA": "Pennsylvania",
    "RI": "Rhode Island",
    "SC": "South Carolina",
    "SD": "South Dakota",
    "TN": "Tennessee",
    "TX": "Texas",
    "UT": "Utah",
    "VT": "Vermont",
    "VA": "Virginia",
    "WA": "Washington",
    "WV": "West Virginia",
    "WI": "Wisconsin",
    "WY": "Wyoming",
    "PR": "Puerto Rico",
}
_STATE_NAME_TO_ABBR = {name.upper(): abbr for abbr, name in _STATE_ABBR_TO_NAME.items()}


AGRITOURISM_FALLBACK = [
    {
        "id": "fallback-salinas",
        "name": "Harvest Moon Family Farm",
        "street": "123 Orchard Lane",
        "city": "Salinas",
        "state": "CA",
        "zip": "93901",
        "phone": "(555) 219-0044",
        "website": "https://harvestmoonfarm.example.com",
        "latitude": 36.6777,
        "longitude": -121.6555,
        "products": "U-pick berries, hayrides, seasonal dinners",
        "season": "May - October",
        "description": "Family-friendly agritourism hub with weekend tours and farm-to-table tastings.",
        "distance": 12.5,
    },
    {
        "id": "fallback-napa",
        "name": "Valley View Lavender Ranch",
        "street": "455 Lavender Ridge Rd",
        "city": "Napa",
        "state": "CA",
        "zip": "94559",
        "phone": "(555) 842-1182",
        "website": "https://valleyviewlavender.example.com",
        "latitude": 38.2975,
        "longitude": -122.2869,
        "products": "Lavender harvest walks, distillery demos, farm shop",
        "season": "April - September",
        "description": "Guided aroma tours with hands-on lavender harvesting and artisan workshops.",
        "distance": 46.2,
    },
    {
        "id": "fallback-yolo",
        "name": "Riverbend Heritage Ranch",
        "street": "89 County Road 22B",
        "city": "Woodland",
        "state": "CA",
        "zip": "95776",
        "phone": "(555) 764-3301",
        "website": "https://riverbendheritage.example.com",
        "latitude": 38.6785,
        "longitude": -121.7733,
        "products": "Historic farm stays, cider tastings, educational tours",
        "season": "Year-round",
        "description": "Generational ranch with overnight cabins and weekend harvest experiences.",
        "distance": 82.4,
    },
]


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


def _donation_spoilage_score(donation, now):
    if getattr(donation, "is_prediction", False):
        return None

    available_from = getattr(donation, "available_from", None)
    if available_from and available_from > now:
        return 0

    status = getattr(donation, "status", "available")
    if status == "collected":
        return 5
    if status == "expired":
        return 100

    available_until = getattr(donation, "available_until", None)
    total_window_hours = None
    if available_from and available_until:
        total_window_seconds = max((available_until - available_from).total_seconds(), 0)
        if total_window_seconds > 0:
            total_window_hours = total_window_seconds / 3600.0

    risk = 0.0
    if total_window_hours is not None:
        remaining_seconds = (available_until - now).total_seconds()
        if remaining_seconds <= 0:
            return 100
        remaining_hours = remaining_seconds / 3600.0
        elapsed_hours = max(total_window_hours - remaining_hours, 0.0)
        progress_ratio = min(1.0, elapsed_hours / total_window_hours)
        risk = progress_ratio * 80.0
        if remaining_hours <= 2:
            risk += 15.0
        elif remaining_hours <= 6:
            risk += 8.0
    else:
        base_hours = max((now - available_from).total_seconds() / 3600.0, 0.0) if available_from else 0.0
        risk = min(75.0, base_hours / 24.0 * 20.0)

    claims_list = list(donation.claims.all())
    active_claims = [claim for claim in claims_list if claim.status != "cancelled"]
    collected_claims = [claim for claim in claims_list if claim.status == "collected"]

    if active_claims:
        fulfillment_ratio = len(collected_claims) / len(active_claims)
        if fulfillment_ratio < 0.5:
            risk += 10.0

    if status == "ready":
        risk += 5.0
    elif status == "reserved":
        risk += 2.0

    return max(0, min(100, int(round(risk))))


def _aggregate_spoilage_risk(donations, *, now):
    weighted_scores: list[tuple[float, int]] = []
    for donation in donations:
        score = _donation_spoilage_score(donation, now)
        if score is None:
            continue
        capacity = getattr(donation, "max_pickups", 1) or 1
        weighted_scores.append((score, int(capacity)))

    if not weighted_scores:
        return 0

    total_weight = sum(weight for _, weight in weighted_scores)
    if total_weight <= 0:
        return 0

    composite = sum(score * weight for score, weight in weighted_scores) / float(total_weight)
    return max(0, min(100, int(round(composite))))


def _generate_verification_code(length: int = 6) -> str:
    alphabet = "0123456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))




def _build_daily_series(queryset, date_field: str, *, days: int = 14, value_field: str | None = None) -> dict[str, list]:
    if queryset is None:
        return {"labels": [], "values": []}

    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=max(days - 1, 0))

    try:
        filtered = queryset.filter(**{f"{date_field}__date__gte": start_date})
    except AttributeError:
        return {"labels": [], "values": []}

    aggregation = Sum(value_field) if value_field else Count("id")
    annotated = (
        filtered.annotate(day=TruncDate(date_field))
        .values("day")
        .annotate(value=aggregation)
    )

    value_map: dict[date, int | float] = {}
    for entry in annotated:
        day = entry.get("day")
        if day is None:
            continue
        raw_value = entry.get("value") or 0
        if value_field:
            value_map[day] = float(raw_value)
        else:
            value_map[day] = int(raw_value)

    labels: list[str] = []
    values: list[int | float] = []
    current = start_date
    while current <= end_date:
        labels.append(current.strftime("%m/%d"))
        values.append(value_map.get(current, 0))
        current += timedelta(days=1)

    return {"labels": labels, "values": values}



def _to_decimal(value: object) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None



def _to_int(value: object) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(round(float(value)))
    except (ValueError, TypeError):
        return None



def _normalize_feature_key(key: str) -> str:
    normalized = key.strip().lower().replace("%", "pct").replace(" ", "_")
    while "__" in normalized:
        normalized = normalized.replace("__", "_")
    return normalized



def _district_id_to_geoid(district_id: str | int | None) -> str | None:
    if district_id in (None, ""):
        return None
    digits = "".join(ch for ch in str(district_id) if ch.isdigit())
    if not digits:
        return None
    digits = digits.zfill(4)
    state_fp = digits[:2]
    district_fp = digits[-2:]
    if state_fp == "00":
        return None
    return f"{state_fp}{district_fp}"



def _district_display_parts(forecast) -> tuple[str, str, str]:
    district_id = getattr(forecast, "district_id", None)
    district_code = str(district_id or "").zfill(4)
    district_suffix = district_code[-2:]
    state_label = (getattr(forecast, "state_abbreviation", None) or getattr(forecast, "state_name", None) or "").strip()
    if state_label and district_suffix == "00":
        display_name = f"{state_label} At-Large"
    elif state_label and district_suffix:
        display_name = f"{state_label}-{district_suffix}"
    else:
        display_name = str(district_id)
    return display_name, state_label, district_suffix



def _persist_forecast_rows(rows):
    saved = []
    for row in rows:
        payload = row.get("payload") or {}
        normalized = {_normalize_feature_key(k): v for k, v in payload.items()}
        raw_state = str(row.get("state") or payload.get("state_name") or "").strip()
        state_name = ""
        state_abbrev = ""
        if raw_state:
            upper_state = raw_state.upper()
            if upper_state in _STATE_ABBR_TO_NAME:
                state_abbrev = upper_state
                state_name = _STATE_ABBR_TO_NAME[upper_state]
            else:
                title_state = raw_state.title()
                lookup = title_state.upper()
                if lookup in _STATE_NAME_TO_ABBR:
                    state_abbrev = _STATE_NAME_TO_ABBR[lookup]
                    state_name = title_state
                else:
                    state_abbrev = upper_state[:4]
                    state_name = title_state or upper_state
        child_rate = payload.get("Child Food Insecurity Rate")
        if child_rate is None:
            child_rate = normalized.get("child_food_insecurity_rate")
        estimated_individuals = payload.get("Estimated number  food insecure individuals")
        if estimated_individuals is None:
            estimated_individuals = normalized.get("estimated_number_food_insecure_individuals")
        estimated_children = payload.get("Estimated Number Food Insecure Children")
        if estimated_children is None:
            estimated_children = normalized.get("estimated_number_food_insecure_children")
        low_income_pct = payload.get("% of food insecure children in households with income at or below 185% FPL")
        if low_income_pct is None:
            low_income_pct = normalized.get("pct_of_food_insecure_children_in_households_with_income_at_or_below_185pct_fpl")
        high_income_pct = payload.get("% of food insecure children in households with income above 185% FPL")
        if high_income_pct is None:
            high_income_pct = normalized.get("pct_of_food_insecure_children_in_households_with_income_above_185pct_fpl")

        defaults = {
            "state_name": (state_name or raw_state or "")[:64],
            "state_abbreviation": state_abbrev[:4],
            "overall_food_insecurity_rate": _to_decimal(row.get("overall_rate")),
            "child_food_insecurity_rate": _to_decimal(child_rate),
            "estimated_food_insecure_individuals": _to_int(estimated_individuals),
            "estimated_food_insecure_children": _to_int(estimated_children),
            "low_income_household_pct": _to_decimal(low_income_pct),
            "high_income_household_pct": _to_decimal(high_income_pct),
            "low_type_code": _to_int(payload.get("low_type_code") or normalized.get("low_type_code")),
            "high_type_code": _to_int(payload.get("high_type_code") or normalized.get("high_type_code")),
            "raw_features": payload,
        }

        centroid_lat = payload.get("centroid_latitude") or normalized.get("centroid_latitude")
        centroid_lng = payload.get("centroid_longitude") or normalized.get("centroid_longitude")
        defaults["centroid_latitude"] = _to_decimal(centroid_lat)
        defaults["centroid_longitude"] = _to_decimal(centroid_lng)

        obj, _ = FoodInsecurityForecast.objects.update_or_create(
            district_id=str(row.get("district")),
            year=int(row.get("year")),
            defaults=defaults,
        )
        saved.append(obj)
    return saved



def _ensure_forecasts(cfg: ForecastConfig):
    forecasts_qs = FoodInsecurityForecast.objects.all()
    if forecasts_qs.exists() and not cfg.force_refresh:
        return forecasts_qs

    try:
        predictions = run_food_insecurity_forecast(cfg)
    except Exception:  # noqa: BLE001
        return forecasts_qs

    rows = dataframe_to_forecast_rows(predictions, cfg)
    if rows:
        _persist_forecast_rows(rows)
    return FoodInsecurityForecast.objects.all()



def _rate_to_color(rate: float | None, min_rate: float, max_rate: float) -> str:
    if rate is None:
        return "#B8C2CC"
    span = max(max_rate - min_rate, 1e-6)
    normalized = (rate - min_rate) / span
    normalized = max(0.0, min(1.0, normalized))
    start = (34, 139, 34)
    end = (178, 34, 34)
    r = int(round(start[0] + normalized * (end[0] - start[0])))
    g = int(round(start[1] + normalized * (end[1] - start[1])))
    b = int(round(start[2] + normalized * (end[2] - start[2])))
    return f"#{r:02x}{g:02x}{b:02x}"



def _severity_label(rate: float | None) -> str:
    if rate is None:
        return "unknown"
    if rate < 0.12:
        return "stable"
    if rate < 0.16:
        return "guarded"
    if rate < 0.2:
        return "elevated"
    return "critical"



def _build_forecast_map_payload(forecasts):
    if not forecasts:
        return {
            "features": [],
            "legend": {
                "min_rate": None,
                "max_rate": None,
            },
            "center": _compute_region_from_coords([]),
            "choropleth": {
                "entries": [],
                "default_color": "#e5e7eb",
                "type": "us_congressional_districts",
                "source": static("app/cd118.geojson"),
            },
        }

    rates = [float(f.overall_food_insecurity_rate) for f in forecasts if f.overall_food_insecurity_rate is not None]
    min_rate = min(rates) if rates else 0.0
    max_rate = max(rates) if rates else 0.0

    features = []
    choropleth_entries = []
    for forecast in forecasts:
        data = FoodInsecurityForecastSerializer(forecast).data
        rate_value = (
            float(forecast.overall_food_insecurity_rate)
            if forecast.overall_food_insecurity_rate is not None
            else None
        )
        child_rate = (
            float(forecast.child_food_insecurity_rate)
            if forecast.child_food_insecurity_rate is not None
            else None
        )

        display_name, state_label, _ = _district_display_parts(forecast)

        data["display_name"] = display_name
        data["overall_food_insecurity_rate"] = round(rate_value, 4) if rate_value is not None else None
        data["overall_food_insecurity_pct"] = round(rate_value * 100, 2) if rate_value is not None else None
        data["child_food_insecurity_rate"] = round(child_rate, 4) if child_rate is not None else None
        data["child_food_insecurity_pct"] = round(child_rate * 100, 2) if child_rate is not None else None
        data["severity_color"] = _rate_to_color(rate_value, min_rate, max_rate)
        data["severity_label"] = _severity_label(rate_value)
        geoid = _district_id_to_geoid(forecast.district_id)
        data["district_geoid"] = geoid
        features.append(data)

        if geoid:
            choropleth_entries.append(
                {
                    "geoid": geoid,
                    "color": data["severity_color"],
                    "overall_pct": data["overall_food_insecurity_pct"],
                    "overall_rate": data["overall_food_insecurity_rate"],
                    "severity_label": data["severity_label"],
                    "display_name": display_name,
                }
            )

    centroids = [
        {
            "latitude": float(f.centroid_latitude),
            "longitude": float(f.centroid_longitude),
        }
        for f in forecasts
        if f.centroid_latitude is not None and f.centroid_longitude is not None
    ]

    if not centroids:
        centroids = [
            {
                "latitude": float(z.latitude),
                "longitude": float(z.longitude),
            }
            for z in LocationZone.objects.exclude(latitude__isnull=True, longitude__isnull=True)
        ]

    region = _compute_region_from_coords(centroids) if centroids else _compute_region_from_coords([])

    legend = {
        "min_rate": round(min_rate, 4) if rates else None,
        "max_rate": round(max_rate, 4) if rates else None,
        "labels": {
            "stable": "Below 12%",
            "guarded": "12% to 16%",
            "elevated": "16% to 20%",
            "critical": "Above 20%",
        },
    }

    return {
        "features": features,
        "legend": legend,
        "center": region,
        "choropleth": {
            "entries": choropleth_entries,
            "default_color": "#e5e7eb",
            "type": "us_congressional_districts",
            "source": static("app/cd118.geojson"),
        },
    }

def _format_dashboard_timestamp(value: datetime | None) -> tuple[str | None, str | None]:
    if not value:
        return None, None
    localized = timezone.localtime(value)
    display = date_format(localized, format="N j, Y, P T", use_l10n=True)
    return display, localized.isoformat()


def _generate_food_security_dashboard_payload(*, requested_year: int | None, force_refresh: bool) -> dict:
    ml_dir = Path(__file__).resolve().parent / "ml"
    cfg = ForecastConfig(
        output_path=ml_dir / "predictions_per_district.csv",
        checkpoint_path=ml_dir / "best_seq2seq_model.pth",
        reuse_output=True,
        reuse_model=True,
        force_refresh=force_refresh,
    )

    csv_candidates = [
        Path(settings.BASE_DIR) / "app" / "ml" / "FeedingAmericaData.xlsx",
        ml_dir / "FeedingAmericaData.xlsx",
        Path(settings.BASE_DIR) / "data" / "FeedingAmericaData.xlsx",
    ]
    for candidate in csv_candidates:
        if candidate.exists():
            cfg.csv_path = candidate
            break

    forecasts_qs = _ensure_forecasts(cfg)
    available_years = list(
        forecasts_qs.order_by("year").values_list("year", flat=True).distinct()
    )

    focus_year = requested_year if requested_year in available_years else (available_years[-1] if available_years else None)

    if focus_year is not None:
        forecasts_for_year = list(
            forecasts_qs.filter(year=focus_year)
            .select_related("location_zone")
            .order_by("-overall_food_insecurity_rate")
        )
    else:
        forecasts_for_year = []

    map_payload = _build_forecast_map_payload(forecasts_for_year)

    hotspots = []
    for forecast in forecasts_for_year:
        rate_value = (
            float(forecast.overall_food_insecurity_rate)
            if forecast.overall_food_insecurity_rate is not None
            else None
        )
        display_name, state_label, _ = _district_display_parts(forecast)

        hotspots.append(
            {
                "district_id": forecast.district_id,
                "display_name": display_name,
                "state": state_label,
                "overall_rate": round(rate_value, 4) if rate_value is not None else None,
                "overall_pct": round(rate_value * 100, 2) if rate_value is not None else None,
                "severity": _severity_label(rate_value),
                "estimated_food_insecure_individuals": forecast.estimated_food_insecure_individuals,
                "estimated_food_insecure_children": forecast.estimated_food_insecure_children,
                "location_zone_id": forecast.location_zone_id,
            }
        )

    hotspots = hotspots[:8]

    raw_metrics = _build_dashboard_metrics()
    metrics = dict(raw_metrics)
    time_series = metrics.pop("time_series", {})
    volunteer_map = metrics.pop("volunteer_map", {})
    updated_at = forecasts_qs.aggregate(last_updated=Max("updated_at")).get("last_updated")
    updated_display, updated_iso = _format_dashboard_timestamp(updated_at)

    summary = None
    if forecasts_for_year:
        highest = forecasts_for_year[0]
        highest_rate = (
            float(highest.overall_food_insecurity_rate)
            if highest.overall_food_insecurity_rate is not None
            else None
        )
        if highest_rate is not None:
            highest_label, _, _ = _district_display_parts(highest)
            summary_parts = [
                (
                    f"{highest_label} shows the highest projected rate at {highest_rate * 100:.1f}% in {focus_year}."
                )
            ]

            lowest = next(
                (
                    forecast
                    for forecast in reversed(forecasts_for_year)
                    if forecast.overall_food_insecurity_rate is not None
                ),
                None,
            )
            if lowest and lowest is not highest:
                lowest_rate = float(lowest.overall_food_insecurity_rate)
                lowest_label, _, _ = _district_display_parts(lowest)
                summary_parts.append(
                    (
                        f"{lowest_label} is lowest at {lowest_rate * 100:.1f}%."
                    )
                )

            all_rates = [
                float(f.overall_food_insecurity_rate)
                for f in forecasts_for_year
                if f.overall_food_insecurity_rate is not None
            ]
            if all_rates:
                average_rate = sum(all_rates) / len(all_rates)
                summary_parts.append(
                    f"Average projected rate across tracked districts sits at {average_rate * 100:.1f}%."
                )

            summary = " ".join(summary_parts)

    return {
        "map": map_payload,
        "metrics": metrics,
        "time_series": time_series,
        "volunteer_map": volunteer_map,
        "hotspots": hotspots,
        "available_years": available_years,
        "focus_year": focus_year,
        "summary": summary,
        "updated_at": updated_at,
        "updated_at_display": updated_display,
        "updated_at_iso": updated_iso,
        "refreshed": bool(force_refresh),
    }


def _build_volunteer_activity_map(limit: int = 40) -> dict[str, object]:
    tasks_qs = (
        VolunteerTask.objects.filter(
            pickup_latitude__isnull=False,
            pickup_longitude__isnull=False,
            dropoff_latitude__isnull=False,
            dropoff_longitude__isnull=False,
        )
        .select_related("volunteer")
        .order_by('-scheduled_start', '-created_at', '-id')
    )
    tasks = list(tasks_qs[:limit])

    features: list[dict[str, object]] = []
    stops: list[dict[str, object]] = []
    routes: list[list[list[float]]] = []
    coords: list[dict[str, float]] = []
    status_counts: dict[str, int] = {}
    volunteer_ids: set[int] = set()
    latest_updated: datetime | None = None

    for task in tasks:
        pickup = None
        dropoff = None
        if task.pickup_latitude is not None and task.pickup_longitude is not None:
            pickup = {
                'latitude': float(task.pickup_latitude),
                'longitude': float(task.pickup_longitude),
                'address': task.pickup_address,
            }
            coords.append({'latitude': pickup['latitude'], 'longitude': pickup['longitude']})
            stops.append({
                'role': 'pickup',
                'title': task.title,
                'status': task.status,
                'latitude': pickup['latitude'],
                'longitude': pickup['longitude'],
            })
        if task.dropoff_latitude is not None and task.dropoff_longitude is not None:
            dropoff = {
                'latitude': float(task.dropoff_latitude),
                'longitude': float(task.dropoff_longitude),
                'address': task.dropoff_address,
            }
            coords.append({'latitude': dropoff['latitude'], 'longitude': dropoff['longitude']})
            stops.append({
                'role': 'dropoff',
                'title': task.title,
                'status': task.status,
                'latitude': dropoff['latitude'],
                'longitude': dropoff['longitude'],
            })

        if not (pickup and dropoff):
            continue

        volunteer = task.volunteer
        volunteer_name = None
        volunteer_email = None
        if volunteer:
            volunteer_name = (volunteer.get_full_name() or '').strip() or volunteer.email
            volunteer_email = volunteer.email
            volunteer_ids.add(volunteer.id)

        features.append(
            {
                'id': task.id,
                'title': task.title,
                'status': task.status,
                'urgency': task.urgency,
                'load_size': task.load_size,
                'distance_miles': float(task.distance_miles or 0),
                'estimated_minutes': int(task.estimated_minutes or 0),
                'pickup': pickup,
                'dropoff': dropoff,
                'volunteer': {
                    'name': volunteer_name,
                    'email': volunteer_email,
                } if volunteer else None,
            }
        )

        routes.append(
            [
                [pickup['longitude'], pickup['latitude']],
                [dropoff['longitude'], dropoff['latitude']],
            ]
        )
        status_counts[task.status] = status_counts.get(task.status, 0) + 1
        if latest_updated is None or (task.updated_at and task.updated_at > latest_updated):
            latest_updated = task.updated_at

    region = _compute_region_from_coords(coords) if coords else _compute_region_from_coords([])
    summary = {
        'total_routes': len(features),
        'active_volunteers': len(volunteer_ids),
        'by_status': status_counts,
        'updated_at': latest_updated.isoformat() if latest_updated else None,
    }

    return {
        'features': features,
        'stops': stops,
        'polyline': routes,
        'center': region,
        'summary': summary,
    }





def _build_dashboard_metrics():
    now = timezone.now()
    user_data = {
        "total": User.objects.count(),
        "by_role": {
            entry["role"] or "unspecified": entry["count"]
            for entry in User.objects.values("role").annotate(count=Count("id")).order_by("role")
        },
        "new_last_7_days": User.objects.filter(date_joined__gte=now - timedelta(days=7)).count(),
    }

    donations_qs = Donation.objects.select_related("location_zone", "created_by")
    donations_status = {
        entry["status"]: entry["count"]
        for entry in donations_qs.values("status").annotate(count=Count("id"))
    }
    live_quantity = donations_qs.filter(is_prediction=False).aggregate(total=Sum("quantity"))

    inventory_by_category = [
        {
            "category": entry["category"] or "unspecified",
            "total_quantity": int(entry["total_qty"] or 0),
            "donations": int(entry["count"] or 0),
        }
        for entry in donations_qs.values("category").annotate(
            total_qty=Sum("quantity"),
            count=Count("id"),
        ).order_by("-total_qty")
    ]

    zone_breakdown = [
        {
            "zone": entry["location_zone__name"],
            "level": entry["location_zone__level"],
            "donations": int(entry["count"] or 0),
            "quantity": int(entry["total_qty"] or 0),
        }
        for entry in donations_qs.filter(location_zone__isnull=False)
        .values("location_zone__name", "location_zone__level")
        .annotate(total_qty=Sum("quantity"), count=Count("id"))
        .order_by("-total_qty")[:8]
    ]

    claims_qs = Claim.objects.select_related("donation", "user")
    claims_status = {
        entry["status"]: entry["count"]
        for entry in claims_qs.values("status").annotate(count=Count("id"))
    }
    collected_count = claims_status.get("collected", 0)
    in_flight = claims_status.get("reserved", 0) + claims_status.get("ready", 0)
    active_pipeline = in_flight + collected_count
    claim_conversion = {
        "collected": collected_count,
        "in_flight": in_flight,
        "cancelled": claims_status.get("cancelled", 0),
        "fulfillment_rate": round((collected_count / active_pipeline) * 100, 1) if active_pipeline else 0.0,
    }

    volunteer_tasks_qs = VolunteerTask.objects.select_related("volunteer")
    volunteer_tasks = {
        entry["status"]: entry["count"]
        for entry in volunteer_tasks_qs.values("status").annotate(count=Count("id"))
    }

    volunteer_totals = (
        volunteer_tasks_qs.exclude(volunteer__isnull=True)
        .values("volunteer__id", "volunteer__first_name", "volunteer__last_name", "volunteer__email")
        .annotate(
            assigned=Count("id"),
            completed=Count("id", filter=Q(status="completed")),
            en_route=Count("id", filter=Q(status__in=["en_route", "delivering"])),
            total_distance=Sum("distance_miles"),
        )
        .order_by("-completed", "-assigned")[:5]
    )

    volunteer_leaderboard = []
    for entry in volunteer_totals:
        distance_value = entry.get("total_distance") or Decimal("0")
        volunteer_leaderboard.append(
            {
                "name": (
                    f"{entry.get('volunteer__first_name') or ''} {entry.get('volunteer__last_name') or ''}"
                ).strip() or entry.get("volunteer__email"),
                "email": entry.get("volunteer__email"),
                "assigned": int(entry.get("assigned") or 0),
                "completed": int(entry.get("completed") or 0),
                "in_route": int(entry.get("en_route") or 0),
                "distance_miles": float(distance_value),
            }
        )

    donor_totals = (
        donations_qs.exclude(created_by__isnull=True)
        .values("created_by__id", "created_by__first_name", "created_by__last_name", "created_by__email")
        .annotate(
            donations=Count("id"),
            live=Count("id", filter=Q(status__in=["available", "ready", "reserved"])),
            quantity=Sum("quantity"),
        )
        .order_by("-quantity", "-donations")[:5]
    )

    donor_leaderboard = []
    for entry in donor_totals:
        donor_name = (
            f"{entry.get('created_by__first_name') or ''} {entry.get('created_by__last_name') or ''}"
        ).strip() or entry.get("created_by__email")
        donor_leaderboard.append(
            {
                "name": donor_name,
                "email": entry.get("created_by__email"),
                "donations": int(entry.get("donations") or 0),
                "live": int(entry.get("live") or 0),
                "quantity": int(entry.get("quantity") or 0),
            }
        )

    inspection_status = {
        entry["status"]: entry["count"]
        for entry in FoodInspection.objects.values("status").annotate(count=Count("id"))
    }
    inspections_recent = [
        {
            "status": inspection.status,
            "created": _format_dashboard_timestamp(inspection.created_at)[0],
            "summary": (inspection.analysis or {}).get("summary", "Awaiting analysis"),
        }
        for inspection in FoodInspection.objects.order_by("-created_at")[:5]
    ]

    notifications_qs = Notification.objects.select_related("user")
    notifications_total = notifications_qs.count()
    notifications_upcoming = notifications_qs.filter(scheduled_for__gte=now).count()
    notifications_recent = [
        {
            "message": note.message,
            "type": note.notification_type,
            "scheduled_for": _format_dashboard_timestamp(note.scheduled_for)[0],
            "user": note.user.get_full_name() or note.user.email,
        }
        for note in notifications_qs.order_by("-scheduled_for")[:5]
    ]

    aid_programs_recent = [
        {
            "name": program.name,
            "summary": program.summary,
            "tags": program.tags or [],
        }
        for program in AidProgram.objects.order_by("-updated_at", "-created_at")[:5]
    ]

    aid_recommendation_count = AidRecommendation.objects.count()

    time_series = {
        "donations_created": _build_daily_series(donations_qs, "created_at", days=14),
        "donation_quantity": _build_daily_series(donations_qs, "created_at", days=14, value_field="quantity"),
        "claims_reserved": _build_daily_series(claims_qs, "reserved_at", days=14),
        "tasks_completed": _build_daily_series(
            volunteer_tasks_qs.filter(status="completed"),
            "completed_at",
            days=14,
        ),
        "inspections": _build_daily_series(FoodInspection.objects.all(), "created_at", days=14),
    }

    volunteer_map = _build_volunteer_activity_map()

    return {
        "users": user_data,
        "donations": {
            "total": donations_qs.count(),
            "predicted": donations_qs.filter(is_prediction=True).count(),
            "live": donations_qs.filter(is_prediction=False).count(),
            "by_status": donations_status,
            "live_quantity": int(live_quantity.get("total") or 0),
            "inventory_by_category": inventory_by_category,
            "zones": zone_breakdown,
        },
        "families": {
            "profiles": FamilyProfile.objects.count(),
            "claims_active": Claim.objects.exclude(status="cancelled").count(),
        },
        "volunteers": {
            "profiles": VolunteerProfile.objects.count(),
            "tasks": volunteer_tasks,
            "leaderboard": volunteer_leaderboard,
        },
        "claims": {
            "total": claims_qs.count(),
            "by_status": claims_status,
            "conversion": claim_conversion,
        },
        "aid": {
            "programs": AidProgram.objects.count(),
            "recommendations": aid_recommendation_count,
            "recent_programs": aid_programs_recent,
        },
        "inspections": {
            "total": FoodInspection.objects.count(),
            "by_status": inspection_status,
            "recent": inspections_recent,
        },
        "notifications": {
            "total": notifications_total,
            "upcoming": notifications_upcoming,
            "recent": notifications_recent,
        },
        "leaderboards": {
            "donors": donor_leaderboard,
            "volunteers": volunteer_leaderboard,
        },
        "inventory": {
            "categories": inventory_by_category,
            "zones": zone_breakdown,
        },
        "time_series": time_series,
        "volunteer_map": volunteer_map,
    }


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
        raw_email = (request.data.get("email") or "").strip()
        password = request.data.get("password")
        role_raw = request.data.get("role")
        role = normalize_role(role_raw)

        if not (raw_email and password):
            return Response({"error": "Email and password are required"}, status=status.HTTP_400_BAD_REQUEST)

        normalized_email = (User.objects.normalize_email(raw_email) or "").strip()
        email = normalized_email.lower()

        if User.objects.filter(email__iexact=email).exists():
            return Response({"error": "Email already taken"}, status=status.HTTP_400_BAD_REQUEST)

        if role_raw is not None and role is None:
            return Response({"error": "Role not recognized"}, status=status.HTTP_400_BAD_REQUEST)

        resolved_role = role or "charity"
        user = User.objects.create_user(email=email, password=password, role=resolved_role)
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
        raw_email = (request.data.get("email") or "").strip()
        password = request.data.get("password")

        if not (raw_email and password):
            return Response({"error": "email and password are required"}, status=status.HTTP_400_BAD_REQUEST)

        email = (User.objects.normalize_email(raw_email) or "").lower()

        user = User.objects.filter(email__iexact=email).first()
        if not user:
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


class FamiliesAgritourismSearchView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    backoff_until: datetime | None = None

    def get(self, request, *args, **kwargs):
        query_params = self._build_query_params(request)
        source = "usda"
        fallback_records = AGRITOURISM_FALLBACK
        records = []

        if self._should_attempt_remote():
            try:
                payload = self._fetch_external_results(query_params)
                records = self._extract_records(payload)
                if records:
                    self._clear_backoff()
                else:
                    source = "fallback-empty"
                    records = fallback_records
            except Exception as exc:  # pragma: no cover - defensive network handling
                logger.warning("Agritourism lookup failed (%s). Using fallback data.", exc)
                self._begin_backoff()
                source = "fallback-error"
                records = fallback_records
        else:
            source = "fallback-backoff"
            records = fallback_records

        return Response(
            {
                "results": records,
                "source": source,
                "count": len(records),
                "fallback_results": fallback_records,
                "backoff_seconds": self._backoff_seconds_remaining(),
            }
        )

    def _build_query_params(self, request) -> dict[str, str]:
        params: dict[str, str] = {"program": "agritourism", "size": "50"}

        city = (request.query_params.get("city") or "").strip()
        if city:
            params["city"] = city

        state = (request.query_params.get("state") or "").strip().upper()
        if state:
            params["state"] = state[:2]

        keywords = (request.query_params.get("keywords") or request.query_params.get("q") or "").strip()
        if keywords:
            params["q"] = keywords

        radius = request.query_params.get("radius")
        if radius is not None:
            try:
                radius_value = int(float(radius))
                radius_value = max(1, min(radius_value, 200))
                params["radius"] = str(radius_value)
            except (TypeError, ValueError):
                pass

        latitude = request.query_params.get("latitude")
        if latitude:
            try:
                params["latitude"] = f"{float(latitude):.4f}"
            except (TypeError, ValueError):
                pass

        longitude = request.query_params.get("longitude")
        if longitude:
            try:
                params["longitude"] = f"{float(longitude):.4f}"
            except (TypeError, ValueError):
                pass

        return params

    def _fetch_external_results(self, params: dict[str, str]):
        endpoint = getattr(
            settings,
            "USDA_AGRITOURISM_ENDPOINT",
            "https://api.ams.usda.gov/services/v1/search",
        )
        query_string = urlencode(params)
        url = f"{endpoint}?{query_string}" if query_string else endpoint
        request = Request(
            url,
            headers={
                "Accept": "application/json",
                "User-Agent": "FreshValley/1.0 (+https://freshvalley.local)",
            },
        )

        try:
            with urlopen(request, timeout=12) as response:
                charset = response.headers.get_content_charset("utf-8")
                payload = response.read().decode(charset)
        except (HTTPError, URLError) as exc:
            raise RuntimeError(f"USDA agritourism lookup failed: {exc}") from exc

        try:
            return json.loads(payload)
        except json.JSONDecodeError as exc:
            raise RuntimeError("USDA agritourism response was not valid JSON") from exc

    def _extract_records(self, payload):
        if isinstance(payload, dict):
            for key in ("results", "data", "items"):
                value = payload.get(key)
                if isinstance(value, list):
                    return value
        if isinstance(payload, list):
            return payload
        return []

    def _should_attempt_remote(self) -> bool:
        endpoint = getattr(settings, "USDA_AGRITOURISM_ENDPOINT", "")
        if not endpoint:
            return False
        until = self.__class__.backoff_until
        if until and until > timezone.now():
            return False
        return True

    def _begin_backoff(self):
        minutes = max(int(getattr(settings, "AGRITOURISM_BACKOFF_MINUTES", 15)), 1)
        self.__class__.backoff_until = timezone.now() + timedelta(minutes=minutes)

    def _clear_backoff(self):
        self.__class__.backoff_until = None

    def _backoff_seconds_remaining(self) -> int:
        until = self.__class__.backoff_until
        if not until:
            return 0
        seconds = int((until - timezone.now()).total_seconds())
        return max(seconds, 0)


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

"""
class FoodSecurityDashboardView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        refresh_raw = (request.query_params.get("refresh") or "").strip().lower()
        force_refresh = refresh_raw in {"1", "true", "yes", "y", "refresh"}

        year_param = request.query_params.get("year")
        focus_year: int | None = None
        if year_param:
            try:
                focus_year = int(year_param)
            except (TypeError, ValueError):
                focus_year = None

        ml_dir = Path(__file__).resolve().parent / "ml"
        cfg = ForecastConfig(
            output_path=ml_dir / "predictions_per_district.csv",
            checkpoint_path=ml_dir / "best_seq2seq_model.pth",
            reuse_output=True,
            reuse_model=True,
            force_refresh=force_refresh,
        )

        csv_candidates = [
            Path(settings.BASE_DIR) / "app" / "ml" / "FeedingAmericaData.xlsx",
            ml_dir / "FeedingAmericaData.xlsx",
            Path(settings.BASE_DIR) / "data" / "FeedingAmericaData.xlsx",
        ]
        for candidate in csv_candidates:
            if candidate.exists():
                cfg.csv_path = candidate
                break

        forecasts_qs = _ensure_forecasts(cfg)
        available_years = list(
            forecasts_qs.order_by("year").values_list("year", flat=True).distinct()
        )

        if focus_year not in available_years:
            focus_year = available_years[-1] if available_years else None

        if focus_year is not None:
            forecasts_for_year = list(
                forecasts_qs.filter(year=focus_year)
                .select_related("location_zone")
                .order_by("-overall_food_insecurity_rate")
            )
        else:
            forecasts_for_year = []

        map_payload = _build_forecast_map_payload(forecasts_for_year)

        hotspots = []
        for forecast in forecasts_for_year:
            rate_value = (
                float(forecast.overall_food_insecurity_rate)
                if forecast.overall_food_insecurity_rate is not None
                else None
            )
            hotspots.append(
                {
                    "district_id": forecast.district_id,
                    "state": forecast.state_abbreviation or forecast.state_name,
                    "overall_rate": round(rate_value, 4) if rate_value is not None else None,
                    "overall_pct": round(rate_value * 100, 2) if rate_value is not None else None,
                    "severity": _severity_label(rate_value),
                    "estimated_food_insecure_individuals": forecast.estimated_food_insecure_individuals,
                    "estimated_food_insecure_children": forecast.estimated_food_insecure_children,
                    "location_zone_id": forecast.location_zone_id,
                }
            )

        hotspots = hotspots[:8]

        metrics = _build_dashboard_metrics()
        updated_at = forecasts_qs.aggregate(last_updated=Max("updated_at")).get("last_updated")

        summary = None
        if forecasts_for_year:
            highest = forecasts_for_year[0]
            highest_rate = (
                float(highest.overall_food_insecurity_rate)
                if highest.overall_food_insecurity_rate is not None
                else None
            )
            if highest_rate is not None:
                summary_parts = [
                    (
                        f"{highest.district_id} ({highest.state_abbreviation or highest.state_name}) "
                        f"shows the highest projected rate at {highest_rate * 100:.1f}% in {focus_year}."
                    )
                ]

                lowest = next(
                    (
                        forecast
                        for forecast in reversed(forecasts_for_year)
                        if forecast.overall_food_insecurity_rate is not None
                    ),
                    None,
                )
                if lowest and lowest is not highest:
                    lowest_rate = float(lowest.overall_food_insecurity_rate)
                    summary_parts.append(
                        (
                            f"{lowest.district_id} ({lowest.state_abbreviation or lowest.state_name}) "
                            f"is lowest at {lowest_rate * 100:.1f}%."
                        )
                    )

                all_rates = [
                    float(f.overall_food_insecurity_rate)
                    for f in forecasts_for_year
                    if f.overall_food_insecurity_rate is not None
                ]
                if all_rates:
                    average_rate = sum(all_rates) / len(all_rates)
                    summary_parts.append(
                        f"Average projected rate across tracked districts sits at {average_rate * 100:.1f}%."
                    )

                summary = " ".join(summary_parts)

        payload = {
            "map": map_payload,
            "metrics": metrics,
            "hotspots": hotspots,
            "available_years": available_years,
            "focus_year": focus_year,
            "summary": summary,
            "updated_at": updated_at,
            "refreshed": bool(force_refresh),
        }

        return Response(payload)
"""
def _bump_dashboard_years(payload, *, bump: int = 2):
    if not isinstance(payload, dict):
        return payload
    years = payload.get("available_years")
    if isinstance(years, list):
        payload["available_years"] = [
            year + bump if isinstance(year, int) else year for year in years
        ]
    focus_year = payload.get("focus_year")
    if isinstance(focus_year, int):
        payload["focus_year"] = focus_year + bump
    return payload


class FoodSecurityDashboardView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        refresh_raw = (request.query_params.get("refresh") or "").strip().lower()
        force_refresh = refresh_raw in {"1", "true", "yes", "y", "refresh"}

        requested_year: int | None = None
        year_param = request.query_params.get("year")
        if year_param:
            try:
                requested_year = int(year_param)
            except (TypeError, ValueError):
                requested_year = None

        payload = _generate_food_security_dashboard_payload(
            requested_year=requested_year,
            force_refresh=force_refresh,
        )
        _bump_dashboard_years(payload)
        return Response(payload)


class FoodSecurityDashboardPageView(TemplateView):
    template_name = "app/food_security_dashboard.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        refresh_raw = (self.request.GET.get("refresh") or "").strip().lower()
        force_refresh = refresh_raw in {"1", "true", "yes", "y", "refresh"}

        requested_year: int | None = None
        year_param = self.request.GET.get("year")
        if year_param:
            try:
                requested_year = int(year_param)
            except (TypeError, ValueError):
                requested_year = None

        payload = _generate_food_security_dashboard_payload(
            requested_year=requested_year,
            force_refresh=force_refresh,
        )
        _bump_dashboard_years(payload)
        map_payload = payload.get("map") or {}

        context.update(
            dashboard=payload,
            map_payload=map_payload,
            legend=map_payload.get("legend", {}),
            hotspots=payload.get("hotspots") or [],
            available_years=payload.get("available_years") or [],
            focus_year=payload.get("focus_year"),
            volunteer_map=payload.get("volunteer_map") or {},
            mapbox_token=getattr(settings, "MAPBOX_ACCESS_TOKEN", ""),
        )
        return context

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
        donor_name = (payload.get("donor_name") or "").strip()
        if not donor_name:
            donor_name = (user.get_full_name() or "").strip() or user.email
        payload["donor_name"] = donor_name
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
        now = timezone.now()
        claims_qs = Claim.objects.filter(donation__created_by=user)
        claims_data = list(claims_qs.values("status", "reserved_at", "collected_at"))

        donations_qs = (
            Donation.objects.filter(created_by=user)
            .select_related("location_zone")
            .prefetch_related("claims")
        )
        donation_list = list(donations_qs)

        def _as_local_date(value):
            if not value:
                return None
            if timezone.is_aware(value):
                return timezone.localtime(value).date()
            return value.date()

        weekly_trends = []
        today = now.date()
        current_week_start = today - timedelta(days=today.weekday())
        for offset in range(5, -1, -1):
            week_start = current_week_start - timedelta(weeks=offset)
            week_end = week_start + timedelta(days=6)
            reservations_count = 0
            collected_count_week = 0
            for claim in claims_data:
                reserved_dt = claim.get("reserved_at")
                reserved_date = _as_local_date(reserved_dt)
                if reserved_date and week_start <= reserved_date <= week_end:
                    reservations_count += 1
                if claim.get("status") == "collected":
                    collected_dt = claim.get("collected_at")
                    collected_date = _as_local_date(collected_dt)
                    if collected_date and week_start <= collected_date <= week_end:
                        collected_count_week += 1
            weekly_trends.append(
                {
                    "label": week_start.strftime("%b %d"),
                    "reservations": reservations_count,
                    "collected": collected_count_week,
                }
            )

        category_label_map = dict(Donation.CATEGORY_CHOICES)
        category_counter = Counter(
            donation.category
            for donation in donation_list
            if donation.category and not getattr(donation, "is_prediction", False)
        )
        category_mix = [
            {"category": category_label_map.get(code, code), "count": count}
            for code, count in category_counter.most_common()
        ]

        spoilage_risk = _aggregate_spoilage_risk(donation_list, now=now)

        total_claims = len(claims_data)
        collected_count = sum(1 for claim in claims_data if claim.get("status") == "collected")
        fulfillment_pct = (collected_count / total_claims * 100) if total_claims else None

        recent_cutoff = now - timedelta(days=14)
        recent_cancellations = sum(
            1
            for claim in claims_data
            if claim.get("status") == "cancelled"
            and claim.get("reserved_at")
            and claim["reserved_at"] >= recent_cutoff
        )

        open_slots = 0
        for donation in donation_list:
            if donation.status not in {"available", "ready"}:
                continue
            claims_for_donation = list(donation.claims.all())
            active_claims = [claim for claim in claims_for_donation if claim.status != "cancelled"]
            remaining = max((donation.max_pickups or 0) - len(active_claims), 0)
            open_slots += remaining

        tips: list[str] = []
        if fulfillment_pct is None:
            tips.append("Publish your first donation to unlock engagement insights and fulfillment tracking.")
        else:
            if fulfillment_pct < 70:
                tips.append(
                    f"Only {fulfillment_pct:.0f}% of reservations are collected. Tighten pickup windows or send reminder messages before pickup times."
                )
            elif fulfillment_pct > 90:
                tips.append(
                    "Over 90% of your reservations are collected — keep coordinating with couriers to maintain that pace."
                )

        if recent_cancellations:
            tips.append(
                f"{recent_cancellations} reservation{'s' if recent_cancellations != 1 else ''} were cancelled in the last 14 days. Confirm timing with families to reduce no-shows."
            )

        if open_slots > 0 and collected_count:
            tips.append(
                f"You still have {open_slots} pickup slot{'s' if open_slots != 1 else ''} open. Highlight those opportunities in your next notification."
            )

        if donation_list:
            if spoilage_risk >= 70:
                tips.append(
                    "Spoilage risk is high — prioritize upcoming pickups or shorten the availability window for items at risk."
                )
            elif spoilage_risk <= 25 and collected_count:
                tips.append("Spoilage risk is low — your donations are getting claimed well before they expire.")

        if len(weekly_trends) >= 2:
            recent_week = weekly_trends[-1]["reservations"]
            previous_week = weekly_trends[-2]["reservations"]
            if previous_week and recent_week < previous_week:
                tips.append(
                    "Reservations dipped week over week. Try posting earlier in the day or narrowing donation windows."
                )
            elif recent_week > previous_week:
                tips.append("Reservation volume rose this week — keep the same cadence of postings to sustain momentum.")

        if not tips:
            if donation_list:
                tips.append("Keep tracking pickup confirmations — your data looks healthy across the last six weeks.")
            else:
                tips.append("Start a donation to populate analytics for pickup trends, spoilage risk, and category mix.")

        tips = tips[:3]

        return Response(
            {
                "weekly_trends": weekly_trends,
                "category_mix": category_mix,
                "spoilage_risk_score": spoilage_risk,
                "ai_tips": tips,
            }
        )


class DonorImpactView(APIView):
    permission_classes = [IsAuthenticated, IsDonor]
    authentication_classes = [TokenAuthentication]

    def get(self, request, *args, **kwargs):
        user = request.user
        now = timezone.now()
        claims = Claim.objects.filter(donation__created_by=user)
        collected_claims = claims.filter(status="collected")
        total_meals = collected_claims.count() * 4

        period_start = now - timedelta(days=7)
        leaderboard_period = "this week"
        leaderboard_rows = list(
            Claim.objects.filter(
                status="collected",
                donation__created_by__isnull=False,
                reserved_at__gte=period_start,
            )
            .values("donation__created_by")
            .annotate(total_claims=Count("id"), last_collected=Max("collected_at"))
            .order_by("-total_claims", "-last_collected", "donation__created_by")
        )

        if not leaderboard_rows:
            leaderboard_rows = list(
                Claim.objects.filter(status="collected", donation__created_by__isnull=False)
                .values("donation__created_by")
                .annotate(total_claims=Count("id"), last_collected=Max("collected_at"))
                .order_by("-total_claims", "-last_collected", "donation__created_by")
            )
            leaderboard_period = "all time"

        aggregated = [entry for entry in leaderboard_rows if entry.get("donation__created_by")]
        donor_ids = [entry["donation__created_by"] for entry in aggregated]
        donor_map = {u.id: u for u in User.objects.filter(id__in=donor_ids)}

        leaderboard_full = []
        for index, entry in enumerate(aggregated, start=1):
            donor_id = entry["donation__created_by"]
            donor_user = donor_map.get(donor_id)
            if not donor_user:
                continue
            leaderboard_full.append(
                {
                    "rank": index,
                    "name": donor_user.get_full_name() or donor_user.email,
                    "meals": entry["total_claims"] * 4,
                    "user_id": donor_id,
                }
            )

        display_board = leaderboard_full[:5]
        user_ids_in_board = {item["user_id"] for item in display_board}
        if user.id not in user_ids_in_board:
            user_entry = next((item for item in leaderboard_full if item["user_id"] == user.id), None)
            if user_entry:
                display_board.append(user_entry)
            else:
                next_rank = leaderboard_full[-1]["rank"] + 1 if leaderboard_full else 1
                display_board.append(
                    {
                        "rank": next_rank,
                        "name": user.get_full_name() or user.email,
                        "meals": total_meals,
                        "user_id": user.id,
                    }
                )

        if not display_board:
            display_board = [
                {
                    "rank": 1,
                    "name": user.get_full_name() or user.email,
                    "meals": total_meals,
                    "user_id": user.id,
                }
            ]

        leaderboards = [
            {"rank": item["rank"], "name": item["name"], "meals": item["meals"]}
            for item in display_board
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

        cancellations_last_week = claims.filter(
            status="cancelled", reserved_at__gte=timezone.now() - timedelta(days=7)
        ).count()
        badges = [
            {"label": "First 100 Meals", "earned": total_meals >= 100},
            {
                "label": "Zero Waste Week",
                "earned": cancellations_last_week == 0 and claims.exists(),
            },
            {
                "label": "Freshness Hero",
                "earned": collected_claims.count() >= 20,
            },
        ]

        return Response(
            {
                "leaderboard": leaderboards,
                "impact_tree": impact_tree,
                "badges": badges,
                "leaderboard_period": leaderboard_period,
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


