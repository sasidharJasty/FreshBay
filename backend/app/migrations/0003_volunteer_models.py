# Generated manually to introduce volunteer profiles and tasks.
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0008_donorprofile_next_pickup_at_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='VolunteerProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('phone_number', models.CharField(blank=True, default='', max_length=32)),
                ('vehicle_type', models.CharField(blank=True, default='', max_length=64)),
                ('vehicle_capacity', models.CharField(blank=True, default='', max_length=64)),
                ('license_plate', models.CharField(blank=True, default='', max_length=32)),
                ('driver_license_number', models.CharField(blank=True, default='', max_length=64)),
                ('verification_status', models.CharField(choices=[('pending', 'Pending'), ('verified', 'Verified'), ('expired', 'Expired')], default='pending', max_length=16)),
                ('availability', models.JSONField(blank=True, default=list)),
                ('notify_email', models.BooleanField(default=True)),
                ('notify_sms', models.BooleanField(default=False)),
                ('notify_push', models.BooleanField(default=True)),
                ('preferred_shift_start', models.CharField(blank=True, default='', max_length=5)),
                ('preferred_shift_end', models.CharField(blank=True, default='', max_length=5)),
                ('miles_driven', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('meals_delivered', models.PositiveIntegerField(default=0)),
                ('co2_saved_kg', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('efficiency_score', models.DecimalField(decimal_places=2, default=0, max_digits=4)),
                ('badges', models.JSONField(blank=True, default=list)),
                ('rating', models.DecimalField(blank=True, decimal_places=2, default=5, max_digits=3)),
                ('last_verified_at', models.DateTimeField(blank=True, null=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='volunteer_profile', to='app.user')),
            ],
            options={
                'verbose_name': 'Volunteer profile',
                'verbose_name_plural': 'Volunteer profiles',
            },
        ),
        migrations.CreateModel(
            name='VolunteerTask',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=255)),
                ('summary', models.TextField(blank=True, default='')),
                ('status', models.CharField(choices=[('open', 'Open'), ('assigned', 'Assigned'), ('en_route', 'En route'), ('picked_up', 'Picked up'), ('delivering', 'Delivering'), ('completed', 'Completed'), ('cancelled', 'Cancelled')], default='open', max_length=16)),
                ('urgency', models.CharField(choices=[('low', 'Low'), ('medium', 'Medium'), ('high', 'High'), ('critical', 'Critical')], default='medium', max_length=16)),
                ('load_size', models.CharField(choices=[('small', 'Small'), ('medium', 'Medium'), ('large', 'Large')], default='medium', max_length=16)),
                ('distance_miles', models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ('estimated_minutes', models.PositiveIntegerField(default=0)),
                ('pickup_address', models.CharField(max_length=255)),
                ('pickup_latitude', models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('pickup_longitude', models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('dropoff_address', models.CharField(max_length=255)),
                ('dropoff_latitude', models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('dropoff_longitude', models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('scheduled_start', models.DateTimeField(blank=True, null=True)),
                ('scheduled_end', models.DateTimeField(blank=True, null=True)),
                ('route_sequence', models.PositiveIntegerField(default=0)),
                ('efficiency_score', models.DecimalField(decimal_places=2, default=0, max_digits=4)),
                ('completion_photo_url', models.URLField(blank=True, default='')),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('notes', models.TextField(blank=True, default='')),
                ('auto_assigned_at', models.DateTimeField(blank=True, null=True)),
                ('volunteer', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='volunteer_tasks', to='app.user')),
            ],
            options={
                'ordering': ('route_sequence', 'scheduled_start', 'id'),
            },
        ),
    ]
