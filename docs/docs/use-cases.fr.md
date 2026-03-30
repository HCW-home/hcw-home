# Cas d'utilisation

HCW@Home couvre les principaux scenarios de teleconsultation dans le domaine medical et institutionnel.

## Consultation spontanee (chat + appel)

Un praticien cree une consultation pour un patient et communique en temps reel.

**Flux typique :**

1. Le praticien cree une nouvelle consultation depuis son interface
2. Le patient recoit une invitation par SMS ou email avec un lien d'acces
3. Le patient accede a l'interface via son navigateur (aucune installation requise)
4. Praticien et patient echangent par chat (messages, fichiers, images)
5. Le praticien lance un appel video ou audio
6. Le patient recoit la notification d'appel et rejoint la consultation
7. Le praticien ferme la consultation une fois terminee

**Fonctionnalites utilisees :** chat temps reel, appels audio/video, partage de fichiers, notifications push, invitations SMS/email.

---

## Rendez-vous planifie

Un praticien planifie une consultation a une date et heure precise avec un ou plusieurs participants.

**Flux typique :**

1. Le praticien cree un rendez-vous depuis le calendrier (FullCalendar)
2. Il selectionne le type : en ligne (video) ou en personne
3. Les participants invites recoivent un rappel automatique (configurable : 24h avant, 10 min avant, etc.)
4. A l'heure du rendez-vous, chaque participant rejoint la salle video
5. Le praticien peut enregistrer la session si necessaire

**Fonctionnalites utilisees :** calendrier, rappels automatiques, video multi-participants, enregistrement de sessions (S3).

---

## Consultation multi-participants

Plusieurs praticiens et/ou invites participent a une meme consultation.

**Flux typique :**

1. Le praticien cree un rendez-vous et ajoute plusieurs participants (collegues, specialistes, interpretes)
2. Chaque participant recoit une invitation
3. Tous rejoignent la meme salle de videoconference
4. Partage d'ecran possible pour presenter des documents

**Fonctionnalites utilisees :** consultations multi-participants, partage d'ecran, chat de groupe.

---

## Invitation d'un patient anonyme

Un patient sans compte est invite pour une teleconsultation ponctuelle.

**Flux typique :**

1. Le praticien cree une consultation et genere un lien d'invitation
2. Le lien est envoye par SMS ou email au patient
3. Le patient accede a la consultation via son navigateur, sans creation de compte
4. Apres la consultation, le compte temporaire est automatiquement supprime (configurable)

**Fonctionnalites utilisees :** utilisateurs temporaires, invitations par lien, auto-nettoyage.

---

## Gestion de files d'attente (groupes)

Les demandes de consultation sont reparties entre les praticiens d'un meme service.

**Flux typique :**

1. L'administrateur cree des groupes (ex : "Medecine generale", "Cardiologie", "Dermatologie")
2. Les praticiens sont assignes a un ou plusieurs groupes
3. Une demande de consultation arrive dans un groupe
4. Les praticiens du groupe voient la demande et l'un d'eux la prend en charge
5. La consultation est assignee au praticien qui a accepte

**Fonctionnalites utilisees :** groupes/files d'attente, assignation automatique ou manuelle, methodes d'assignation configurables.

---

## Teletriage / pre-consultation

Un patient remplit un formulaire de demande avec des champs personnalises avant d'etre mis en relation.

**Flux typique :**

1. L'administrateur configure des champs personnalises (motif, symptomes, urgence, etc.)
2. Le patient ou un operateur soumet une demande de consultation
3. La demande est acheminees vers le bon groupe selon le motif
4. Le praticien consulte les informations pre-remplies avant de prendre en charge

**Fonctionnalites utilisees :** champs personnalises, raisons de consultation, files d'attente.

---

## Partage de documents et ordonnances

Le praticien partage des documents, rapports ou ordonnances avec le patient de maniere securisee.

**Flux typique :**

1. Durant ou apres la consultation, le praticien envoie des fichiers via le chat
2. Les fichiers sont scannes par l'antivirus (ClamAV) avant d'etre transmis
3. Le patient telecharge les documents depuis son interface
4. Un rapport PDF de la consultation peut etre genere

**Fonctionnalites utilisees :** partage de fichiers, antivirus ClamAV, generation de rapports PDF.

---

## Multi-organisation / multi-tenant

Plusieurs organisations (hopitaux, cliniques) partagent la meme instance avec une isolation complete des donnees.

**Flux typique :**

1. L'administrateur systeme cree un tenant pour chaque organisation
2. Chaque organisation a son propre domaine (ex : `hopital-a.example.com`, `clinique-b.example.com`)
3. Les utilisateurs, consultations et configurations sont completement isoles entre tenants
4. Chaque organisation peut personnaliser son logo, ses couleurs et ses parametres

**Fonctionnalites utilisees :** multi-tenancy par schema PostgreSQL, domaines personnalises, configuration independante par tenant.

---

## Authentification unifiee (SSO)

Les utilisateurs se connectent via le systeme d'authentification existant de l'institution.

**Flux typique :**

1. L'administrateur configure le fournisseur OpenID Connect (Keycloak, Azure AD, etc.)
2. Les praticiens se connectent via le bouton "Se connecter avec..." sur la page de login
3. L'authentification est deleguee au fournisseur d'identite
4. Le compte est cree automatiquement au premier login

**Fonctionnalites utilisees :** OpenID Connect, JWT, creation automatique de comptes.

---

## Administration et supervision

L'administrateur gere la plateforme via une interface dediee.

**Cas d'usage :**

- **Gestion des utilisateurs** : creer, modifier, desactiver des comptes praticiens et patients
- **Configuration** : parametrer les rappels, les delais, le nom du site, les URLs des applications
- **Templates de messages** : personnaliser les emails et SMS envoyes aux patients
- **Traductions** : surcharger les traductions directement depuis l'interface d'administration
- **Import/Export** : importer ou exporter des donnees en masse (utilisateurs, etc.)
- **Monitoring** : tableau de bord avec statistiques d'utilisation
- **Tokens API** : generer des tokens pour l'integration avec des systemes tiers

**Fonctionnalites utilisees :** interface Unfold, constance (configuration dynamique), import/export, API REST avec documentation Swagger.

---

## Resume des roles

| Role | Interface | Acces |
|------|-----------|-------|
| **Patient** | Application patient (Ionic/web) | Consultations, chat, appels, fichiers |
| **Praticien** | Application praticien (Angular PWA) | Gestion completes des consultations, rendez-vous, calendrier |
| **Administrateur** | Interface Django admin (Unfold) | Configuration, utilisateurs, templates, monitoring |
| **Super-administrateur** | Interface Django admin | Configuration systeme, tokens API, parametres avances |
