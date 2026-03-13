import os

from django.db import connection


class TenantUploadTo:
    """
    Callable upload_to that prefixes the path with the current tenant's
    schema name, e.g. "mytenant/organisations/logo.png".

    Implements deconstruct() so Django migrations can serialize it.
    """

    def __init__(self, subfolder):
        self.subfolder = subfolder

    def __call__(self, instance, filename):
        schema = getattr(connection, "schema_name", None) or "public"
        return os.path.join(schema, self.subfolder, filename)

    def deconstruct(self):
        return (
            "core.storage.TenantUploadTo",
            [self.subfolder],
            {},
        )
