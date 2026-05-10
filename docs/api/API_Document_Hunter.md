https://api.hunter.io/v2/domain-search?domain=stripe.com&api_key={HUNTER_API_KEY}

Kết quả trả về:
{
  "data": {
    "domain": "intercom.com",
    "disposable": false,
    "webmail": false,
    "accept_all": true,
    "pattern": "{first}",
    "organization": "Intercom",
    "linked_domains": [],
    "emails": [
      {
        "value": "ciaran@intercom.com",
        "type": "personal",
        "confidence": 92,
        "sources": [
          {
            "domain": "github.com",
            "uri": "http://github.com/ciaranlee",
            "extracted_on": "2015-07-29",
            "last_seen_on": "2017-07-01",
            "still_on_page": true
          },
          {
            "domain": "blog.intercom.com",
            "uri": "http://blog.intercom.com/were-hiring-a-support-engineer/",
            "extracted_on": "2015-08-29",
            "last_seen_on": "2017-07-01",
            "still_on_page": true
          },
          ...
        ],
        "first_name": "Ciaran",
        "last_name": "Lee",
        "position": "Support Engineer",
        "position_raw": "Support Engineer",
        "seniority": "senior",
        "department": "it",
        "linkedin": null,
        "twitter": "ciaran_lee",
        "phone_number": null,
        "verification": {
          "date": "2019-12-06",
          "status": "valid"
        }
      },
      ...
    ]
  },
  "meta": {
    "results": 35,
    "limit": 10,
    "offset": 0,
    "params": {
      "domain": "intercom.com",
      "company": null,
      "type": null,
      "seniority": null,
      "department": null
    }
  }
}


https://api.hunter.io/v2/email-finder?domain=reddit.com&first_name=Alexis&last_name=Ohanian&api_key={HUNTER_API_KEY}

Kết quả trả về:
{
  "data": {
    "first_name": "Alexis",
    "last_name": "Ohanian",
    "email": "alexis@reddit.com",
    "score": 97,
    "domain": "reddit.com",
    "accept_all": false,
    "position": "Cofounder",
    "twitter": null,
    "linkedin_url": null,
    "phone_number": null,
    "company": "Reddit",
    "sources": [
      {
        "domain": "redditblog.com",
        "uri": "http://redditblog.com/2008/10/22/widgets-get-an-upgrade-and-a-firefox-extension-that-will-rock-your-world",
        "extracted_on": "2018-10-19",
        "last_seen_on": "2021-05-18",
        "still_on_page": true
      },
      ...
    ],
    "verification": {
      "date": "2021-06-14",
      "status": "valid"
    }
  },
  "meta": {
    "params": {
      "first_name": "Alexis",
      "last_name": "Ohanian",
      "full_name": null,
      "domain": "reddit.com",
      "company": null,
      "max_duration": null
    }
  }
}

https://api.hunter.io/v2/email-verifier?email=patrick@stripe.com&api_key={HUNTER_API_KEY}

{
  "data": {
    "status": "valid",
    "score": 100,
    "email": "patrick@stripe.com",
    "regexp": true,
    "gibberish": false,
    "disposable": false,
    "webmail": false,
    "mx_records": true,
    "smtp_server": true,
    "smtp_check": true,
    "accept_all": false,
    "block": false,
    "sources": [
      {
        "domain": "beta.paganresearch.io",
        "uri": "http://beta.paganresearch.io/details/stripe",
        "extracted_on": "2020-06-17",
        "last_seen_on": "2020-06-17",
        "still_on_page": true
      },
      {
        "domain": "icloudnewz.blogspot.com",
        "uri": "http://icloudnewz.blogspot.com/2017/11/follow-patrick-collison-mike-birbiglia.html",
        "extracted_on": "2020-03-25",
        "last_seen_on": "2020-06-29",
        "still_on_page": true
      }
    ]
  },
  "meta": {
    "params": {
      "email": "patrick@stripe.com"
    }
  }
}