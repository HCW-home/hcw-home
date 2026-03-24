from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0030_alter_user_mobile_phone_number"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="user",
            name="is_online",
        ),
    ]
