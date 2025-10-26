from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def bootstrap_donor_profiles(apps, schema_editor):
    User = apps.get_model('app', 'User')
    DonorProfile = apps.get_model('app', 'DonorProfile')
    DonorTeamMember = apps.get_model('app', 'DonorTeamMember')

    for user in User.objects.filter(role='donor'):
        profile, created = DonorProfile.objects.get_or_create(
            user=user,
            defaults={
                'organization_name': '',
                'contact_name': user.get_full_name() or user.email.split('@')[0],
            },
        )
        if created:
            DonorTeamMember.objects.create(
                profile=profile,
                name=profile.contact_name or 'Operations Lead',
                email=user.email,
                role='owner',
                status='active',
                permissions=['manage_donations', 'view_analytics', 'manage_team'],
                last_active_at=django.utils.timezone.now(),
            )


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0006_donation_created_by_max_pickups'),
    ]

    operations = [
        migrations.CreateModel(
            name='DonorProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('organization_name', models.CharField(blank=True, default='', max_length=255)),
                ('contact_name', models.CharField(blank=True, default='', max_length=255)),
                ('contact_phone', models.CharField(blank=True, default='', max_length=32)),
                ('default_category', models.CharField(blank=True, choices=[('produce', 'Produce'), ('dairy', 'Dairy'), ('bread', 'Bread & Bakery'), ('prepared', 'Prepared Meals'), ('pantry', 'Pantry Staples'), ('beverage', 'Beverages')], default='', max_length=20)),
                ('max_daily_pickups', models.PositiveIntegerField(default=8)),
                ('auto_confirm_ready', models.BooleanField(default=True)),
                ('auto_publish_ai', models.BooleanField(default=False)),
                ('preferred_pickup_window', models.PositiveIntegerField(default=90)),
                ('notify_email', models.BooleanField(default=True)),
                ('notify_sms', models.BooleanField(default=False)),
                ('notify_push', models.BooleanField(default=True)),
                ('digest_hour_local', models.PositiveSmallIntegerField(default=9)),
                ('quiet_hours_start', models.CharField(default='21:00', max_length=5)),
                ('quiet_hours_end', models.CharField(default='06:00', max_length=5)),
                ('enable_team_notifications', models.BooleanField(default=True)),
                ('auto_assign_couriers', models.BooleanField(default=False)),
                ('external_notes', models.TextField(blank=True, default='')),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='donor_profile', to='app.user')),
            ],
            options={
                'verbose_name': 'Donor profile',
                'verbose_name_plural': 'Donor profiles',
            },
        ),
        migrations.CreateModel(
            name='DonorTeamMember',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=255)),
                ('email', models.EmailField(max_length=254)),
                ('role', models.CharField(default='collaborator', max_length=64)),
                ('status', models.CharField(choices=[('active', 'Active'), ('invited', 'Invited'), ('suspended', 'Suspended')], default='invited', max_length=16)),
                ('invite_sent_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('last_active_at', models.DateTimeField(blank=True, null=True)),
                ('permissions', models.JSONField(blank=True, default=list)),
                ('profile', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='team_members', to='app.donorprofile')),
            ],
            options={
                'verbose_name': 'Donor team member',
                'verbose_name_plural': 'Donor team members',
            },
        ),
        migrations.RunPython(bootstrap_donor_profiles, migrations.RunPython.noop),
    ]
