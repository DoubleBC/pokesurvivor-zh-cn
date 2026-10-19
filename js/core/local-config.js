/* Always replace upstream settings with this edition's own public web config. */
G.FIREBASE_CONFIG = G.SITE_CONFIG && G.SITE_CONFIG.firebase || null;
