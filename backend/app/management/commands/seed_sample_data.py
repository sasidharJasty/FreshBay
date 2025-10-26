from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from app.models import (
    Donation,
    DonorProfile,
    DonorTeamMember,
    LocationZone,
    VolunteerProfile,
    VolunteerTask,
)


class Command(BaseCommand):
    help = "Seed core sample data for donors and volunteers"

    def handle(self, *args, **options):
        with transaction.atomic():
            self.stdout.write(self.style.MIGRATE_HEADING("Seeding sample data..."))
            self._seed_locations()
            self._seed_donor_data()
            self._seed_volunteer_data()
            self.stdout.write(self.style.SUCCESS("Sample data seeded."))

    def _seed_locations(self):
        zones = [
            {
                "name": "Market Street Hub",
                "level": "high",
                "households_supported": 180,
                "latitude": Decimal("37.774929"),
                "longitude": Decimal("-122.419418"),
            },
            {
                "name": "Mission Community Garden",
                "level": "medium",
                "households_supported": 140,
                "latitude": Decimal("37.759773"),
                "longitude": Decimal("-122.414618"),
            },
            {
                "name": "Portside Warehouse",
                "level": "low",
                "households_supported": 80,
                "latitude": Decimal("37.798363"),
                "longitude": Decimal("-122.398118"),
            },
        ]
        for zone_data in zones:
            LocationZone.objects.update_or_create(
                name=zone_data["name"], defaults=zone_data
            )

    def _seed_donor_data(self):
        User = get_user_model()
        donor, created = User.objects.get_or_create(
            email="donor@example.com",
            defaults={
                "first_name": "Jordan",
                "last_name": "Kim",
                "role": "donor",
                "is_active": True,
            },
        )
        if created:
            donor.set_password("FreshBayDemo!1")
            donor.save(update_fields=["password"])
        profile, _ = DonorProfile.objects.get_or_create(
            user=donor,
            defaults={
                "organization_name": "Fresh Valley Foods",
                "contact_name": "Jordan Kim",
                "contact_phone": "415-555-0199",
                "volunteers_needed": 3,
            },
        )

        DonorTeamMember.objects.update_or_create(
            profile=profile,
            email="manager@freshvalley.org",
            defaults={
                "name": "Mira Patel",
                "role": "Operations",
                "status": "active",
            },
        )

        zones = list(LocationZone.objects.all())
        now = timezone.now()
        donations = [
            {
                "title": "Morning Produce Pallets",
                "donor_name": profile.organization_name,
                "category": "produce",
                "freshness_notes": "Leafy greens harvested at dawn",
                "distance_miles": Decimal("1.6"),
                "available_from": now - timedelta(hours=1),
                "available_until": now + timedelta(hours=4),
                "max_pickups": 4,
                "quantity": 4,
                "status": "available",
                "location_zone": zones[0] if zones else None,
            },
            {
                "title": "Prepared Meal Kits",
                "donor_name": profile.organization_name,
                "category": "prepared",
                "freshness_notes": "Includes 60 individual veggie bowls",
                "distance_miles": Decimal("2.4"),
                "available_from": now,
                "available_until": now + timedelta(hours=6),
                "max_pickups": 3,
                "quantity": 2,
                "status": "ready",
                "location_zone": zones[1] if len(zones) > 1 else None,
            },
            {
                "title": "Dry Goods Cases",
                "donor_name": profile.organization_name,
                "category": "pantry",
                "freshness_notes": "Assorted beans, rice, shelf-stable proteins",
                "distance_miles": Decimal("3.2"),
                "available_from": now + timedelta(hours=8),
                "available_until": now + timedelta(days=1),
                "max_pickups": 5,
                "quantity": 5,
                "status": "predicted",
                "location_zone": zones[2] if len(zones) > 2 else None,
                "is_prediction": True,
            },
        ]

        for payload in donations:
            Donation.objects.update_or_create(
                title=payload["title"],
                defaults={**payload, "created_by": profile.user},
            )

    def _seed_volunteer_data(self):
        User = get_user_model()
        volunteer, created = User.objects.get_or_create(
            email="volunteer@example.com",
            defaults={
                "first_name": "Riley",
                "last_name": "Chen",
                "role": "volunteer",
                "is_active": True,
            },
        )
        if created:
            volunteer.set_password("FreshBayDemo!1")
            volunteer.save(update_fields=["password"])
        profile, _ = VolunteerProfile.objects.get_or_create(
            user=volunteer,
            defaults={
                "vehicle_type": "Transit Van",
                "vehicle_capacity": "12 large crates",
                "miles_driven": Decimal("124.5"),
                "meals_delivered": 520,
                "co2_saved_kg": Decimal("210.3"),
                "efficiency_score": Decimal("92.5"),
                "availability": ["weekday-mornings", "weekend-afternoons"],
            },
        )

        zones = list(LocationZone.objects.all())
        VolunteerTask.objects.update_or_create(
            title="Harborview Pickup",
            volunteer=volunteer,
            defaults={
                "summary": "Collect prepared meal kits and drop to the Bayview Pantry",
                "status": "assigned",
                "urgency": "high",
                "load_size": "large",
                "distance_miles": Decimal("6.4"),
                "estimated_minutes": 42,
                "pickup_address": "Fresh Valley Foods, 100 Market St",
                "pickup_latitude": zones[0].latitude if zones else Decimal("37.774929"),
                "pickup_longitude": zones[0].longitude if zones else Decimal("-122.419418"),
                "dropoff_address": "Bayview Pantry, 5800 3rd St",
                "dropoff_latitude": zones[1].latitude if len(zones) > 1 else Decimal("37.729510"),
                "dropoff_longitude": zones[1].longitude if len(zones) > 1 else Decimal("-122.382240"),
                "scheduled_start": timezone.now() + timedelta(hours=1),
                "scheduled_end": timezone.now() + timedelta(hours=3),
                "route_sequence": 1,
                "efficiency_score": Decimal("93.0"),
            },
        )

        VolunteerTask.objects.update_or_create(
            title="Mission Community Drop",
            volunteer=None,
            defaults={
                "summary": "Assist with distributing produce at Mission Community Garden",
                "status": "open",
                "urgency": "medium",
                "load_size": "medium",
                "distance_miles": Decimal("4.1"),
                "estimated_minutes": 35,
                "pickup_address": "Fresh Valley Foods, 100 Market St",
                "pickup_latitude": zones[0].latitude if zones else Decimal("37.774929"),
                "pickup_longitude": zones[0].longitude if zones else Decimal("-122.419418"),
                "dropoff_address": "Mission Community Garden, 631 Dolores St",
                "dropoff_latitude": zones[1].latitude if len(zones) > 1 else Decimal("37.759773"),
                "dropoff_longitude": zones[1].longitude if len(zones) > 1 else Decimal("-122.414618"),
                "scheduled_start": timezone.now() + timedelta(hours=5),
                "scheduled_end": timezone.now() + timedelta(hours=6, minutes=30),
                "route_sequence": 2,
                "efficiency_score": Decimal("88.0"),
            },
        )

        profile.badges = sorted(set(profile.badges + ["Route Hero", "Freshness Guardian"]))
        profile.save(update_fields=["badges", "updated_at"])
