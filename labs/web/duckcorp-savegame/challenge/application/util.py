import os, pycurl, json
from urllib.parse import urlparse

generate = lambda x: os.urandom(x).hex()

def request(url):
    try:
        c = pycurl.Curl()
        c.setopt(c.URL, url)
        c.setopt(c.TIMEOUT, 10)
        c.setopt(c.VERBOSE, True)
        c.setopt(c.FOLLOWLOCATION, True)
        c.setopt(c.HTTPHEADER, [
            'Accept: application/json',
            'Content-Type: application/json'
        ])

        resp = c.perform_rb().decode('utf-8', errors='ignore')
        c.close()

        return resp

    except pycurl.error as e:
        return 'Something went wrong!'

def get_profile(url):
    domain = urlparse(url).hostname
    scheme = urlparse(url).scheme

    if not filter(lambda x: scheme in x, ('http',' https')):
        return f'Scheme {scheme} is not allowed'

   
    elif domain and not domain == 'duckcorp.local':
        return f'Domain {domain} is not allowed'

    try:
        jsonData = json.loads(request(url))
        return jsonData
    except:
        return 'Not a valid save data file'