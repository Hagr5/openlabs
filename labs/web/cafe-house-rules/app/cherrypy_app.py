import cherrypy


def see_other(path):
    cherrypy.response.status = 303
    cherrypy.response.headers["Location"] = path
    return ""


class App:
    @cherrypy.expose
    def preferences(self, lang=None):
        if lang is None:
            return "<a href='?lang=en'>en</a> <a href='?lang=ar'>ar</a>"
        cherrypy.response.headers["Set-Cookie"] = f"LANG={lang}; Path=/"
        return see_other("/rules")


if __name__ == "__main__":
    cherrypy.config.update(
        {
            "server.socket_host": "0.0.0.0",
            "server.socket_port": 8000,
            "log.screen": True,
        }
    )
    cherrypy.quickstart(App())
