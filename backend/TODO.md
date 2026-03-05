
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

Update websocket
================

je veux que tu simplifie le status user online : 
- ne stocke plus dans la base de données, remplace par une propriété du modèle. La propriété récupère la valeur du cache, ou false si inexistant.
- stocke la variable dans le cache django, le cache ne doit pas durer plus que 1 minutes.
- le hearthbeat du websocket envoi des ping / pong, à la réception j'un ping du frontend, mettre à jour le cache pour deux nouvelles minutes.
- en cas de déconnection, le backend envoi un live alive, si pas de réponse après une seconde, supprimer du cache.
- coté client (practitioner et patient), en cas de réception d'un alive, répondre au alive.



Gérer les mises à jour frontend
===============================

Il faudrait avertir l'utilisateur lorsque le frontend est mis à jour.