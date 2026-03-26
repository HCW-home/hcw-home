import uuid

from django.db import migrations, models


def populate_room_uuids(apps, schema_editor):
    Consultation = apps.get_model("consultations", "Consultation")
    for obj in Consultation.objects.filter(room_uuid__isnull=True):
        obj.room_uuid = uuid.uuid4()
        obj.save(update_fields=["room_uuid"])

    Appointment = apps.get_model("consultations", "Appointment")
    for obj in Appointment.objects.filter(room_uuid__isnull=True):
        obj.room_uuid = uuid.uuid4()
        obj.save(update_fields=["room_uuid"])


class Migration(migrations.Migration):

    dependencies = [
        ("consultations", "0046_customfield_name_es_customfield_name_it_and_more"),
    ]

    operations = [
        # Step 1: Add nullable fields
        migrations.AddField(
            model_name="consultation",
            name="room_uuid",
            field=models.UUIDField(null=True, verbose_name="room UUID"),
        ),
        migrations.AddField(
            model_name="appointment",
            name="room_uuid",
            field=models.UUIDField(null=True, verbose_name="room UUID"),
        ),
        # Step 2: Populate existing rows
        migrations.RunPython(populate_room_uuids, migrations.RunPython.noop),
        # Step 3: Make non-nullable and unique
        migrations.AlterField(
            model_name="consultation",
            name="room_uuid",
            field=models.UUIDField(
                default=uuid.uuid4, editable=False, unique=True, verbose_name="room UUID"
            ),
        ),
        migrations.AlterField(
            model_name="appointment",
            name="room_uuid",
            field=models.UUIDField(
                default=uuid.uuid4, editable=False, unique=True, verbose_name="room UUID"
            ),
        ),
    ]
