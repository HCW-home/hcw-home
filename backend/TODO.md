
* Add validation on phone number

## Top priority

# Misc

- Implement system message in backend in consultation, to log system event, created_by will be empty

![alt text](image.png)
- specialities/id/doctors/ is not returning full image path for picture
- permissions : doctor without permission should see dashboard and consultation
- User messages for patient is giving 404 not found
- picture on reason is not correct, fix for debug mode
- patient will be redirected to patient app if login in doctor app


- dashboard overdue consultations is missing profile picture full path
- after openid login everything is 403 except for dashboard end-point
- getting 403 on consultation messages in patient app
- add ability to override backend translations
- test sms and preferred communication method
- dashboard is returning no appointment for patient, but you can join practitioner, and patient is receiving call 
- add a way to send link again, get link for temporary participant


- Use GenericForeignKey for message foreign relation

Feedback Gilles
===============

- image cannot be svg
- http://localhost:8001/new-request > validation synchrone ?

- Tableau on comprend pas cliquable

Controle pendant l'appel pas clair
==================================

Il faudrait ajouter des petits labels à droite des boutons.

Appeler le patient doit être grisé si pas online
================================================

Le patient ne doit pas pouvoir être appelé directement si pas online.

Ajouter icone spécialisé
========================

Ajoute une icone personnalisé pour la spécialité (paramétrable dans l'admin), visible par le patient dans http://localhost:8001/new-request