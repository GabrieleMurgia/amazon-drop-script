import requests

webhook_url = 'https://discord.com/api/webhooks/1370756540767801354/svEBGqBMVDU8Ystak-AZONHSPfpRgUrNWLxLDc6BtiCKXzxSOaC8Zc13hhLg5-0spG1H'

data = {
    "username": "TCGNotify",
    "embeds": [
        {
            "title": "CONFEZIONE DI BUSTE DELL’ESPANSIONE SCARLATTO E VIOLETTO - 151 DEL GCC POKÉMON (SEI BUSTE DI ESPANSIONE), EDIZIONE IN ITALIANO",
            "url": "https://www.amazon.it/amazon-products-jdl/dp/B0BSR7T3G7?tag=borissu05-21&keywords=made+by+@boris1228",
            "description": "*ASIN:* B0BSR7T3G7 :flag_it:\n\n"
                           "*Site*: amazon_restock_it\n"
                           "*Type*: Restock\n"
                           "*Sizes*: LANGUAGE: IT\n"
                           "*QTS*: [Pepper](http://quicktasks.pepperscripts.com:13391/?pid=B0BSR7T3G7&offer=e7LbMG2LeWuLmBOWsSLu2Tc%2BZt1WN%2BBy0MpyX6Rib1GG%2BrY5ni5lDtlwq5jinYuuHKAaS7TA6m0big7hytH5jJ75OSj67Lmc6smhwhr8aqvqyYsXGzRKOCSZxPQERzfrQId5QbYfIKvYRkyl%2BbPBiA%3D%3D&source=https%3A%2F%2Fwww.amazon.it%2Fdp%2FB0BSR7T3G7) | "
                           "[PanIO](https://www.panaio.com/quicktask?site=Amazon&link=B0BSR7T3G7&details=e7LbMG2LeWuLmBOWsSLu2Tc%2BZt1WN%2BBy0MpyX6Rib1GG%2BrY5ni5lDtlwq5jinYuuHKAaS7TA6m0big7hytH5jJ75OSj67Lmc6smhwhr8aqvqyYsXGzRKOCSZxPQERzfrQId5QbYfIKvYRkyl%2BbPBiA%3D%3D&country=it) | "
                           "[Antares](https://quicktasks.antaresbot.com/quicktask?product=B0BSR7T3G7&site=amazon&region=IT&offerId=e7LbMG2LeWuLmBOWsSLu2Tc%2BZt1WN%2BBy0MpyX6Rib1GG%2BrY5ni5lDtlwq5jinYuuHKAaS7TA6m0big7hytH5jJ75OSj67Lmc6smhwhr8aqvqyYsXGzRKOCSZxPQERzfrQId5QbYfIKvYRkyl%2BbPBiA%3D%3D)\n\n"
                           "*Extra*: [ATC](https://www.amazon.it/gp/checkoutportal/enter-checkout.html/ref=pd_bap_d_rp_bn_3?checkoutClientId=retailwebsite&buyNow=1&quantity=1&asin=B0BSR7T3G7&tag=borissu05-21) | "
                           "[FASTx1](https://www.amazon.it/gp/checkoutportal/enter-checkout.html?offeringID=e7LbMG2LeWuLmBOWsSLu2Tc%2BZt1WN%2BBy0MpyX6Rib1GG%2BrY5ni5lDtlwq5jinYuuHKAaS7TA6m0big7hytH5jJ75OSj67Lmc6smhwhr8aqvqyYsXGzRKOCSZxPQERzfrQId5QbYfIKvYRkyl%2BbPBiA%3D%3D&quantity=1&buyNow=1&tag=borissu05-21) | "
                           "[FASTx2](https://www.amazon.it/gp/checkoutportal/enter-checkout.html?offeringID=e7LbMG2LeWuLmBOWsSLu2Tc%2BZt1WN%2BBy0MpyX6Rib1GG%2BrY5ni5lDtlwq5jinYuuHKAaS7TA6m0big7hytH5jJ75OSj67Lmc6smhwhr8aqvqyYsXGzRKOCSZxPQERzfrQId5QbYfIKvYRkyl%2BbPBiA%3D%3D&quantity=2&buyNow=1&tag=borissu05-21) | "
                           "[PREW](https://www.amazon.it/stores/page/preview?isSlp=1&isPreview=1&asins=B0BSR7T3G7&tag=borissu05-21)",
            "color": 15844367,
            "footer": {
                "text": "TCGNotify - 16:45:57"
            },
            "image": {
                "url": "https://m.media-amazon.com/images/I/51CDThnv-NL.jpg"
            }
        }
    ]
}

response = requests.post(webhook_url, json=data)

if response.status_code == 204:
    print("✅ Notifica inviata con successo!")
else:
    print(f"❌ Errore nell'invio: {response.status_code} - {response.text}")