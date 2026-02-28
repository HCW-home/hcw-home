* [OK] (only email for now) Magic link login, this should accept phone number or email in body, and just send email or sms to that phone number or email It should navigte to /verification?token=xxxxxxx we need verfy patient access token , which should return current accesss token and create user if user doesn't exists with that emil or phone nuber

* [OK] patient active conultations, patient closed consultation, one api with (type|status) filter
* [OK] / notifications screen
* [OK] settings, where they can configure notification settings
* [OK] book an apointnmen button, where they can create consultation
they can jump to active consultation screen, means consultation room, and messaging, file shareing
update patient user information

* Add some field in user
* Add location field
* On sent action appointement, I would track partitipant
* Add message logic and send link and datetime of appointment
* Add calculated status field for participant (participant : sent, read, accepted)
* Add validation on phone number

* edit appointment > reset participant notification status


## Top priority

# Toast

- Add toast with title, description (details or error if backend give)
- Add traceback with detail and copy button in case of error (Gor)

# Misc

- Remove arrow on Patient page list (click on line is enough)
- Implement system message in backend in consultation, to log system event, created_by will be empty

![alt text](image.png)
- specialities/id/doctors/ is not returning full image path for picture
- permissions : doctor without permission should see dashboard and consultation
- User messages for patient is giving 404 not found
- picture on reason is not correct, fix for debug mode
- patient will be redirected to patient app if login in doctor app


- online status is not properly updated in consultations detail for participant
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
- Des fois le websocket s'affiche même sur la page de login
