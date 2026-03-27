from django import forms
from django.contrib import admin
from django.contrib import messages
from .models import Server, Turn, TurnURL
from unfold.admin import ModelAdmin, TabularInline
from unfold.decorators import action
from unfold.widgets import UnfoldAdminPasswordWidget
from django.http import HttpRequest
from django.utils.translation import gettext_lazy as _

class TurnURLInline(TabularInline):
    model = TurnURL
    fields = ['url']
    extra = 1

@admin.register(Turn)
class TurnAdmin(ModelAdmin):
    list_display = ['turn_urls', 'login']
    inlines = [TurnURLInline]
    
    def turn_urls(self, obj):
        return ', '.join([url.url for url in obj.turnurl_set.all()])
    turn_urls.short_description = 'URLs'

class ServerForm(forms.ModelForm):
    api_secret = forms.CharField(
        label=_("API secret"),
        widget=UnfoldAdminPasswordWidget(),
        required=False,
        help_text=_("Leave blank to keep the current value."),
    )

    class Meta:
        model = Server
        fields = "__all__"

    def clean_api_secret(self):
        value = self.cleaned_data.get("api_secret")
        if not value and self.instance.pk:
            return self.instance.api_secret
        return value


@admin.register(Server)
class ServerAdmin(ModelAdmin):
    form = ServerForm
    list_display = [
        "url",
        "is_active",
    ]

    actions_submit_line = ["save_and_test"]

    @action(
        description=_("Save and test access"),
    )
    def save_and_test(self, request: HttpRequest, server: Server):
        """
        If instance is modified in any way, it also needs to be saved, since this handler is invoked after instance is saved.
        """
        try:
            server.instance.test_connection()
            messages.success(
                request,
                _("Connection to server {url} was successful.").format(url=server.url)
            )
        except Exception as e:
            messages.error(
                request,
                _("Failed to connect to server {url}: {error}").format(
                    url=server.url,
                    error=str(e)
                )
            )
        # server.is_active = True
        # server.save()
