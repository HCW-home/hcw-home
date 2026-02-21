from django.db import migrations, models


def migrate_template_fk_to_event_type(apps, schema_editor):
    """Copy event_type from the related Template into the new event_type field."""
    TemplateValidation = apps.get_model("messaging", "TemplateValidation")
    for tv in TemplateValidation.objects.select_related("template").all():
        if tv.template:
            tv.event_type = tv.template.event_type
            tv.save(update_fields=["event_type"])


class Migration(migrations.Migration):
    dependencies = [
        ("messaging", "0044_alter_messagingprovider_name"),
    ]

    operations = [
        # Step 1: Add event_type as nullable + content_hash
        migrations.AddField(
            model_name="templatevalidation",
            name="event_type",
            field=models.CharField(
                blank=True,
                null=True,
                max_length=100,
                verbose_name="event type",
            ),
        ),
        # Step 2: Migrate data from template FK to event_type
        migrations.RunPython(
            migrate_template_fk_to_event_type,
            reverse_code=migrations.RunPython.noop,
        ),
        # Step 3: Remove old template FK and unique_together
        migrations.AlterUniqueTogether(
            name="templatevalidation",
            unique_together=set(),
        ),
        migrations.RemoveField(
            model_name="templatevalidation",
            name="template",
        ),
        # Step 4: Make event_type non-nullable with choices
        migrations.AlterField(
            model_name="templatevalidation",
            name="event_type",
            field=models.CharField(
                max_length=100,
                verbose_name="event type",
                help_text="The template event type to validate",
            ),
        ),
        # Step 5: Set new unique_together
        migrations.AlterUniqueTogether(
            name="templatevalidation",
            unique_together={("messaging_provider", "event_type", "language_code")},
        ),
    ]
