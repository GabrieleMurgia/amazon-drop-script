import time
import requests

WEBHOOK_URL = (
    "https://discord.com/api/webhooks/"
    "1370756540767801354/svEBGqBMVDU8Ystak-AZONHSPfpRgUrNWLxLDc6BtiCKXzxSOaC8Zc13hhLg5-0spG1H"
)

ASINS = [
    "B0B1MLQ8VM",
    "B0BSR7T3G7",          # «quello sopra» (rimane identico)
    "B0C8NSGN2H",          # secondo ASIN
    "B0DFD2XFHL",        # terzo ASIN (se vuoi un altro, cambia qui)
]


def build_embed(asin: str) -> dict:
    """Ritorna il payload Discord personalizzato per l’ASIN indicato."""
    return {
        "username": "TCGNotify",
        "embeds": [
            {
                # Titolo generico (puoi sostituirlo con quello reale se lo conosci)
                "title": f"Nuovo restock – ASIN {asin}",
                "url": f"https://www.amazon.it/dp/{asin}?tag=borissu05-21",
                "description": (
                    f"*ASIN:* **{asin}** :flag_it:\n\n"
                    "*Site*: amazon_restock_it\n"
                    "*Type*: Restock\n"
                    "*Sizes*: LANGUAGE: IT\n"
                    "*QTS*: [Pepper]"
                    f"(http://quicktasks.pepperscripts.com:13391/?pid={asin}) | "
                    f"[PanIO](https://www.panaio.com/quicktask?site=Amazon&link={asin}) | "
                    f"[Antares](https://quicktasks.antaresbot.com/quicktask?product={asin}&site=amazon&region=IT)\n\n"
                    "*Extra*: "
                    f"[ATC](https://www.amazon.it/gp/checkoutportal/enter-checkout.html"
                    f"?checkoutClientId=retailwebsite&buyNow=1&quantity=1&asin={asin}&tag=borissu05-21)"
                ),
                "color": 0xF1C40F,
                "footer": {"text": "TCGNotify – via Python"},
                # In assenza di un’immagine certa, la omettiamo:
                # "image": {"url": f"https://m.media-amazon.com/images/I/{asin}.jpg"}
            }
        ],
    }


def send_webhook(payload: dict) -> None:
    resp = requests.post(WEBHOOK_URL, json=payload)
    if resp.status_code == 204:
        print("✅ Inviato correttamente")
    else:
        print(f"❌ Errore {resp.status_code}: {resp.text}")


if __name__ == "__main__":
    for asin in ASINS:
        send_webhook(build_embed(asin))
        time.sleep(7)            # ↳ wait 1 second before the next one
