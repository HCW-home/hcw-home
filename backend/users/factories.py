import factory
from factory.django import DjangoModelFactory
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from users.models import (
    Term, Organisation, Language, Speciality, HealthMetric,
    FCMDeviceOverride
)

User = get_user_model()


class TermFactory(DjangoModelFactory):
    class Meta:
        model = Term

    name = factory.Sequence(lambda n: f"Terms and Conditions v{n}")
    content = factory.Faker('text', max_nb_chars=1000)


class OrganisationFactory(DjangoModelFactory):
    class Meta:
        model = Organisation

    name = factory.Faker('company')
    primary_color_patient = factory.Faker('hex_color')
    primary_color_practitioner = factory.Faker('hex_color')
    default_term = factory.SubFactory(TermFactory)
    street = factory.Faker('street_address')
    city = factory.Faker('city')
    postal_code = factory.Faker('postcode')
    country = factory.Faker('country')
    footer_patient = factory.Faker('text', max_nb_chars=200)
    footer_practitioner = factory.Faker('text', max_nb_chars=200)


class LanguageFactory(DjangoModelFactory):
    class Meta:
        model = Language

    name = factory.Faker('language_name')
    code = factory.Sequence(lambda n: f"l{n:02d}")


class SpecialityFactory(DjangoModelFactory):
    class Meta:
        model = Speciality

    name = factory.Sequence(lambda n: f"Speciality {n}")


class FCMDeviceOverrideFactory(DjangoModelFactory):
    class Meta:
        model = FCMDeviceOverride

    user = factory.SubFactory('users.tests.factories.UserFactory')
    registration_id = factory.Faker('uuid4')
    device_id = factory.Faker('uuid4')
    active = True
    type = 'android'


class UserFactory(DjangoModelFactory):
    class Meta:
        model = User

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    first_name = factory.Faker('first_name')
    last_name = factory.Faker('last_name')
    is_active = True
    is_staff = False
    is_superuser = False
    encrypted = False
    app_preferences = factory.LazyFunction(lambda: {"notifications": True, "theme": "light"})
    preferred_language = 'en'
    communication_method = 'email'
    timezone = 'UTC'

    @factory.post_generation
    def languages(self, create, extracted, **kwargs):
        if not create:
            return
        if extracted:
            for language in extracted:
                self.languages.add(language)

    @factory.post_generation
    def specialities(self, create, extracted, **kwargs):
        if not create:
            return
        if extracted:
            for speciality in extracted:
                self.specialities.add(speciality)

    @factory.post_generation
    def organisations(self, create, extracted, **kwargs):
        if not create:
            return
        if extracted:
            for organisation in extracted:
                self.organisations.add(organisation)


class HealthMetricFactory(DjangoModelFactory):
    class Meta:
        model = HealthMetric

    user = factory.SubFactory(UserFactory)
    created_by = factory.SubFactory(UserFactory)
    measured_by = factory.SelfAttribute('created_by')
    measured_at = factory.LazyFunction(timezone.now)

    # Anthropometrics
    height_cm = factory.Faker('pydecimal', left_digits=3, right_digits=2, min_value=150, max_value=200, positive=True)
    weight_kg = factory.Faker('pydecimal', left_digits=3, right_digits=2, min_value=50, max_value=120, positive=True)
    waist_cm = factory.Faker('pydecimal', left_digits=3, right_digits=1, min_value=60, max_value=120, positive=True)
    hip_cm = factory.Faker('pydecimal', left_digits=3, right_digits=1, min_value=70, max_value=130, positive=True)
    body_fat_pct = factory.Faker('pydecimal', left_digits=2, right_digits=2, min_value=5, max_value=40, positive=True)

    # Vital signs
    systolic_bp = factory.Faker('pyint', min_value=90, max_value=180)
    diastolic_bp = factory.Faker('pyint', min_value=60, max_value=110)
    heart_rate_bpm = factory.Faker('pyint', min_value=60, max_value=100)
    respiratory_rate = factory.Faker('pyint', min_value=12, max_value=20)
    temperature_c = factory.Faker('pydecimal', left_digits=2, right_digits=2, min_value=36, max_value=38, positive=True)
    spo2_pct = factory.Faker('pyint', min_value=95, max_value=100)
    pain_score_0_10 = factory.Faker('pyint', min_value=0, max_value=10)

    # Glucose / diabetes
    glucose_fasting_mgdl = factory.Faker('pydecimal', left_digits=3, right_digits=2, min_value=70, max_value=130, positive=True)
    glucose_random_mgdl = factory.Faker('pydecimal', left_digits=3, right_digits=2, min_value=80, max_value=200, positive=True)
    hba1c_pct = factory.Faker('pydecimal', left_digits=2, right_digits=2, min_value=4, max_value=10, positive=True)

    # Lipid panel
    chol_total_mgdl = factory.Faker('pydecimal', left_digits=3, right_digits=2, min_value=120, max_value=300, positive=True)
    hdl_mgdl = factory.Faker('pydecimal', left_digits=2, right_digits=2, min_value=30, max_value=80, positive=True)
    ldl_mgdl = factory.Faker('pydecimal', left_digits=3, right_digits=2, min_value=70, max_value=200, positive=True)
    triglycerides_mgdl = factory.Faker('pydecimal', left_digits=3, right_digits=2, min_value=50, max_value=400, positive=True)

    # Renal function
    creatinine_mgdl = factory.Faker('pydecimal', left_digits=2, right_digits=3, min_value=0.6, max_value=1.5, positive=True)
    egfr_ml_min_1_73m2 = factory.Faker('pydecimal', left_digits=3, right_digits=1, min_value=60, max_value=120, positive=True)
    bun_mgdl = factory.Faker('pydecimal', left_digits=2, right_digits=1, min_value=7, max_value=25, positive=True)

    # Liver panel
    alt_u_l = factory.Faker('pydecimal', left_digits=2, right_digits=1, min_value=10, max_value=50, positive=True)
    ast_u_l = factory.Faker('pydecimal', left_digits=2, right_digits=1, min_value=10, max_value=50, positive=True)
    alp_u_l = factory.Faker('pydecimal', left_digits=3, right_digits=1, min_value=40, max_value=150, positive=True)
    bilirubin_total_mgdl = factory.Faker('pydecimal', left_digits=1, right_digits=2, min_value=0.2, max_value=1.5, positive=True)

    # Electrolytes
    sodium_mmol_l = factory.Faker('pydecimal', left_digits=3, right_digits=1, min_value=135, max_value=145, positive=True)
    potassium_mmol_l = factory.Faker('pydecimal', left_digits=1, right_digits=2, min_value=3.5, max_value=5.0, positive=True)
    chloride_mmol_l = factory.Faker('pydecimal', left_digits=3, right_digits=1, min_value=95, max_value=105, positive=True)
    bicarbonate_mmol_l = factory.Faker('pydecimal', left_digits=2, right_digits=1, min_value=22, max_value=28, positive=True)

    # Hematology
    hemoglobin_g_dl = factory.Faker('pydecimal', left_digits=2, right_digits=1, min_value=12, max_value=16, positive=True)
    wbc_10e9_l = factory.Faker('pydecimal', left_digits=2, right_digits=1, min_value=4, max_value=11, positive=True)
    platelets_10e9_l = factory.Faker('pydecimal', left_digits=3, right_digits=1, min_value=150, max_value=450, positive=True)
    inr = factory.Faker('pydecimal', left_digits=1, right_digits=2, min_value=0.8, max_value=1.2, positive=True)

    # Inflammation
    crp_mg_l = factory.Faker('pydecimal', left_digits=2, right_digits=1, min_value=0, max_value=10, positive=True)
    esr_mm_h = factory.Faker('pyint', min_value=0, max_value=30)

    # Thyroid
    tsh_miu_l = factory.Faker('pydecimal', left_digits=1, right_digits=2, min_value=0.5, max_value=5.0, positive=True)
    t3_ng_dl = factory.Faker('pydecimal', left_digits=3, right_digits=1, min_value=80, max_value=200, positive=True)
    t4_ug_dl = factory.Faker('pydecimal', left_digits=2, right_digits=2, min_value=4.5, max_value=12.0, positive=True)

    # Respiratory
    peak_flow_l_min = factory.Faker('pyint', min_value=300, max_value=700)
    fev1_l = factory.Faker('pydecimal', left_digits=1, right_digits=2, min_value=2.0, max_value=5.0, positive=True)
    fvc_l = factory.Faker('pydecimal', left_digits=1, right_digits=2, min_value=3.0, max_value=6.0, positive=True)

    # Mental health screeners
    phq9_score = factory.Faker('pyint', min_value=0, max_value=15)
    gad7_score = factory.Faker('pyint', min_value=0, max_value=12)

    source = factory.Faker('random_element', elements=['manual', 'device', 'EHR import'])
    notes = factory.Faker('text', max_nb_chars=200)


