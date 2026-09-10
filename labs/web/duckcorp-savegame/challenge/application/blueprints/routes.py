import json, os, re
from flask import render_template, send_file, request, current_app, Blueprint, jsonify

from application.util import get_profile

web = Blueprint('web', __name__)

def response(message, status=200):
    return jsonify({'message': message}), status

@web.route("/")
def index():
    return render_template('index.html')

@web.route("/profiles/<id>")
def profile(id):
    saveFile = f'{current_app.config["PROFILE_DIR"]}/{id}.json';

    if os.path.isfile(saveFile):
        return send_file(saveFile, as_attachment=True)

    return response('Profile not found!', 404)


@web.route('/profiles/<id>/update', methods=['POST'])
def profileUpdate(id):
    saveFile = f'{current_app.config["PROFILE_DIR"]}/{id}.json';

    if not os.path.isfile(saveFile):
        return response('Profile not found!', 404)

    if not request.is_json:
        return response('Missing required parameters!', 401)

    data = request.get_json()
    profileData = data.get('profileData', '')

    if not profileData:
        return response('Missing required parameters!', 401)

    with open(saveFile, 'w') as profileWriter:
        profileWriter.write(profileData)

    return response('Profile data updated successfully!')

@web.route('/profiles/import', methods=['POST'])
def profileImport():
    if not request.is_json:
        return response('Missing required parameters!', 401)

    data = request.get_json()
    profileURL = data.get('profileURL', '')

    if not profileURL:
        return response('Missing required parameters!', 401)

    result = get_profile(profileURL)

    if (type(result)) is not dict:
        return response(result, 401)

    saveFile = f'{current_app.config["PROFILE_DIR"]}/{result["avatarName"]}.json';

    if not os.path.isfile(saveFile):
        return response('Profile id does not match with existing profiles!', 404)

    with open(f'{current_app.config["PROFILE_DIR"]}/{result["avatarName"]}.json', 'w') as profileWriter:
        profileWriter.write(json.dumps(result))

    return response('Profile imported successfully!')

