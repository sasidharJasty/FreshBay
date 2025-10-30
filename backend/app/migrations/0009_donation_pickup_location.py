from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('app', '0008_donorprofile_next_pickup_at_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='donation',
            name='pickup_address',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='donation',
            name='pickup_latitude',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
        ),
        migrations.AddField(
            model_name='donation',
            name='pickup_longitude',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
        ),
    ]
