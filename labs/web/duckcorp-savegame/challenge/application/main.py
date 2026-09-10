from flask import Flask
from application.blueprints.routes import web, response

app = Flask(__name__)
app.config.from_object('application.config.Config')

app.register_blueprint(web, url_prefix='/')

@app.errorhandler(404)
def not_found(error):
    return response('404 Not Found', 404)

@app.errorhandler(403)
def forbidden(error):
    return response('403 Forbidden', 403)

@app.errorhandler(400)
def bad_request(error):
    return response('400 Bad Request', 400)