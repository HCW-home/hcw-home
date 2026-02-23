STATIC=/usr/share
VAR=/var/lib
PROJECT=hcw
COMPONENT=backend

all:
	echo "Nothing to prepare"

${STATIC}/${PROJECT}/${COMPONENT}/venv:
	mkdir -p ${STATIC}/${PROJECT}/${COMPONENT}/venv
	python3 -m venv ${STATIC}/${PROJECT}/${COMPONENT}/venv
	. ${STATIC}/${PROJECT}/${COMPONENT}/venv/bin/activate ; pip3 install -r requirements.txt --ignore-requires-python
	# ${STATIC}/${PROJECT}/${COMPONENT}/venv/bin/python3 manage.py collectstatic
	mkdir -p $(DESTDIR)/${STATIC}/${PROJECT}/${COMPONENT}
	mv ${STATIC}/${PROJECT}/${COMPONENT}/venv $(DESTDIR)/${STATIC}/${PROJECT}/${COMPONENT}

install: ${STATIC}/${PROJECT}/${COMPONENT}/venv
	mkdir -p $(DESTDIR)/${STATIC}/${PROJECT}/${COMPONENT}
	cp -a manage.py api translations consultations core mediaserver messaging statics users $(DESTDIR)/${STATIC}/${PROJECT}/${COMPONENT}
	mkdir -p $(DESTDIR)/etc/${PROJECT}
	cp .env-dist $(DESTDIR)/etc/${PROJECT}/${COMPONENT}.conf
	mkdir -p $(DESTDIR)/${VAR}/${PROJECT}

clean:
	echo "Nothing to clean"
