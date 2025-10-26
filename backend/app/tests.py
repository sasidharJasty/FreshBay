from uuid import uuid4
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import Claim, Donation, LocationZone

User = get_user_model()


class FamiliesReserveViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        unique_email = f"family+{uuid4().hex[:8]}@example.com"
        self.user = User.objects.create_user(email=unique_email, password='testpass123', role='charity')
        self.token = Token.objects.create(user=self.user)
        self.zone = LocationZone.objects.create(
            name='Downtown Hub',
            level='high',
            households_supported=120,
            latitude=37.7749,
            longitude=-122.4194,
        )
        self.donation = Donation.objects.create(
            title='Fresh Produce Box',
            donor_name='Farm Co-op',
            category='produce',
            freshness_notes='Picked this morning',
            distance_miles=1.5,
            available_from=timezone.now(),
            quantity=1,
            status='available',
            location_zone=self.zone,
        )
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

    def test_reserve_available_donation(self):
        response = self.client.post(reverse('families-reserve'), {'donation_id': self.donation.id}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Claim.objects.filter(user=self.user, donation=self.donation).exists())
        claim = Claim.objects.get(user=self.user, donation=self.donation)
        self.assertEqual(claim.status, 'reserved')
        self.donation.refresh_from_db()
        self.assertEqual(self.donation.status, 'reserved')

    def test_reserve_conflict_when_unavailable(self):
        self.donation.status = 'reserved'
        self.donation.save(update_fields=['status'])
        response = self.client.post(reverse('families-reserve'), {'donation_id': self.donation.id}, format='json')
        self.assertEqual(response.status_code, 409)

    def test_id_must_be_valid_integer(self):
        response = self.client.post(reverse('families-reserve'), {'donation_id': 'abc'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_requires_authentication(self):
        self.client.credentials()  # clear auth header
        response = self.client.post(reverse('families-reserve'), {'donation_id': self.donation.id}, format='json')
        self.assertEqual(response.status_code, 401)


class DonorEndpointsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        donor_email = f"donor+{uuid4().hex[:8]}@example.com"
        self.donor = User.objects.create_user(email=donor_email, password='testpass123', role='donor')
        self.donor_token = Token.objects.create(user=self.donor)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.donor_token.key}')

        self.zone = LocationZone.objects.create(
            name='Mission Pantry',
            level='low',
            households_supported=180,
            latitude=37.7599,
            longitude=-122.4148,
        )

        family_email = f"family+{uuid4().hex[:8]}@example.com"
        self.family_user = User.objects.create_user(email=family_email, password='testpass123', role='charity')

        self.donation = Donation.objects.create(
            title='Surplus Bread',
            donor_name='Daily Bakery',
            category='bread',
            freshness_notes='Fresh this morning',
            distance_miles=1.2,
            available_from=timezone.now(),
            available_until=timezone.now() + timedelta(hours=6),
            max_pickups=4,
            quantity=4,
            status='available',
            location_zone=self.zone,
            created_by=self.donor,
        )

        self.claim = Claim.objects.create(
            user=self.family_user,
            donation=self.donation,
            status='reserved',
            reserved_at=timezone.now(),
            verification_code='ZZ-123456',
        )
        self.donation.quantity = max(self.donation.max_pickups - 1, 0)
        self.donation.save(update_fields=['quantity'])

    def test_dashboard_returns_metrics(self):
        response = self.client.get(reverse('donors-dashboard'))
        self.assertEqual(response.status_code, 200)
        self.assertIn('overview', response.data)
        self.assertIn('smart_suggestions', response.data)

    def test_create_donation_sets_owner_and_capacity(self):
        payload = {
            'title': 'Seasonal Produce',
            'donor_name': 'Daily Bakery',
            'category': 'produce',
            'freshness_notes': 'Picked this morning',
            'distance_miles': 2.5,
            'available_from': (timezone.now() + timedelta(hours=1)).isoformat(),
            'available_until': (timezone.now() + timedelta(hours=5)).isoformat(),
            'max_pickups': 6,
            'status': 'available',
            'location_zone': self.zone.id,
        }
        response = self.client.post(reverse('donors-donations'), payload, format='json')
        self.assertEqual(response.status_code, 201)
        donation_id = response.data.get('id')
        self.assertIsNotNone(donation_id)
        created = Donation.objects.get(pk=donation_id)
        self.assertEqual(created.created_by, self.donor)
        self.assertEqual(created.quantity, created.max_pickups)

    def test_claim_status_update_recalculates_capacity(self):
        response = self.client.patch(
            reverse('donors-claim-update', args=[self.claim.id]),
            {'status': 'cancelled'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.donation.refresh_from_db()
        self.assertEqual(self.donation.quantity, self.donation.max_pickups)

    def test_auto_route_suggests_destination(self):
        response = self.client.post(reverse('donors-auto-route'), {'donation_id': self.donation.id}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('destination', response.data)
