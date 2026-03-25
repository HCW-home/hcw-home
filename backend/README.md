How to run tasks manually

```
# In a first console, run the scheduler (reddis is required)
celery -A core worker --beat -l info

# In a second console
./manage.py shell
```

Create super user

```
./manage.py migrate
./manage.py createsuperuser
```

Add Doctor group role

```
./manage.py loaddata initial/Groups.json
```



Dump Doctor group role

```
./manage.py dumpdata auth.group --natural-foreign --natural-primary --indent 2 > initial/Groups.json
```


Get language string to translate

```
./manage.py makemessages --locale=fr --ignore='venv/*'
./manage.py compilemessages --ignore='venv/*'
```
