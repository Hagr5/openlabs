from application.util import generate
import os

class Config(object):
    SECRET_KEY = generate(50)
    PROFILE_DIR = f'{os.getcwd()}/profiles'

class ProductionConfig(Config):
    pass

class DevelopmentConfig(Config):
    DEBUG = True

class TestingConfig(Config):
    TESTING = True