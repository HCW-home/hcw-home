from modeltranslation.translator import register, TranslationOptions

from .models import Organisation, Speciality, Term


@register(Speciality)
class SpecialityTranslation(TranslationOptions):
    fields = ["name"]

@register(Term)
class TermTranslation(TranslationOptions):
    fields = ['name', 'content']

@register(Organisation)
class OrganisationTranslation(TranslationOptions):
    fields = ['login_text_patient', 'login_text_practitioner', 'footer_patient', 'footer_practitioner']