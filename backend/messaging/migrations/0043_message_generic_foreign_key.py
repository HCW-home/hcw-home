import django.db.models.deletion
from django.db import migrations, models


def migrate_object_model_to_content_type(apps, schema_editor):
    """Convert object_model (e.g. 'users.User') + object_pk to content_type + object_id."""
    Message = apps.get_model("messaging", "Message")
    ContentType = apps.get_model("contenttypes", "ContentType")

    for message in Message.objects.filter(object_model__isnull=False).exclude(
        object_model=""
    ):
        try:
            app_label, model_name = message.object_model.split(".")
            ct = ContentType.objects.get(app_label=app_label, model=model_name.lower())
            message.content_type = ct
            message.object_id = message.object_pk
            message.save(update_fields=["content_type", "object_id"])
        except (ContentType.DoesNotExist, ValueError):
            pass


class Migration(migrations.Migration):
    dependencies = [
        ("contenttypes", "0002_remove_content_type_name"),
        ("messaging", "0042_template_template_content_html_de_and_more"),
    ]

    operations = [
        # Step 1: Add new fields
        migrations.AddField(
            model_name="message",
            name="content_type",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                to="contenttypes.contenttype",
            ),
        ),
        migrations.AddField(
            model_name="message",
            name="object_id",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        # Step 2: Migrate data
        migrations.RunPython(
            migrate_object_model_to_content_type,
            reverse_code=migrations.RunPython.noop,
        ),
        # Step 3: Remove old fields
        migrations.RemoveField(
            model_name="message",
            name="object_model",
        ),
        migrations.RemoveField(
            model_name="message",
            name="object_pk",
        ),
        # Step 4: Add index
        migrations.AddIndex(
            model_name="message",
            index=models.Index(
                fields=["content_type", "object_id"],
                name="messaging_m_content_a355a9_idx",
            ),
        ),
    ]
