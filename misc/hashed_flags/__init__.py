import hashlib

from CTFd.plugins.flags import BaseFlag, FLAG_CLASSES, FlagException


class SHA256Flag(BaseFlag):
    name = "sha256"
    templates = {}
    #templates = {  # Nunjucks templates used for key editing & viewing
    #    "create": "/plugins/flags/assets/sha256/create.html",
    #    "update": "/plugins/flags/assets/sha256/edit.html",
    #}

    @staticmethod
    def compare(chal_key_obj, provided):
        if not provided:
            return False

        saved = chal_key_obj.content.strip()
        data = chal_key_obj.data

        if data == "case_insensitive":
            provided = provided.lower()

        # Hash submission
        hashed = hashlib.sha256(provided.encode()).hexdigest()

        if len(saved) != len(hashed):
            return False

        result = 0
        for x, y in zip(saved, hashed):
            result |= ord(x) ^ ord(y)

        return result == 0


def load(app):
    FLAG_CLASSES["sha256"] = SHA256Flag
