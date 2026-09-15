"""Select the initial Explorer connection without combining credential sources."""


def initial_connection(default_endpoint, default_access, default_secret, default_secure, remembered):
    """Prefer a complete local connection; otherwise use browser-safe fields.

    A partial environment configuration must not lend its secret to a remembered
    endpoint or access key. The browser record deliberately never contains a
    secret key.
    """
    has_default_connection = bool(default_endpoint and default_access and default_secret)
    if has_default_connection:
        return {
            "endpoint": default_endpoint,
            "access": default_access,
            "secret": default_secret,
            "secure": default_secure,
            "remember": False,
        }

    return {
        "endpoint": remembered.endpoint,
        "access": remembered.access_key,
        "secret": "",
        "secure": remembered.secure,
        "remember": bool(remembered.endpoint),
    }
