curl --request POST \
     --url https://api.apollo.io/api/v1/mixed_companies/search \
     --header 'Cache-Control: no-cache' \
     --header 'Content-Type: application/json' \
     --header 'accept: application/json'

Thông tin lấy được:
{
  "breadcrumbs": [
    {
      "label": "# Employees",
      "signal_field_name": "organization_num_employees_ranges",
      "value": "250,1000",
      "display_name": "250-1000"
    },
    {
      "label": "# Employees",
      "signal_field_name": "organization_num_employees_ranges",
      "value": "5000,10000",
      "display_name": "5000-10000"
    },
    {
      "label": "Company Locations",
      "signal_field_name": "organization_locations",
      "value": "japan",
      "display_name": "japan"
    },
    {
      "label": "Company Locations",
      "signal_field_name": "organization_locations",
      "value": "ireland",
      "display_name": "ireland"
    }
  ],
  "partial_results_only": false,
  "has_join": false,
  "disable_eu_prospecting": false,
  "partial_results_limit": 10000,
  "pagination": {
    "page": 1,
    "per_page": 2,
    "total_entries": 1184,
    "total_pages": 592
  },
  "accounts": [],
  "organizations": [
    {
      "id": "615d029256de500001bdb460",
      "name": "Nikkei Asia",
      "website_url": "http://www.nikkei.com",
      "blog_url": null,
      "angellist_url": null,
      "linkedin_url": "http://www.linkedin.com/company/nikkeiasia",
      "twitter_url": "https://twitter.com/nikkei",
      "facebook_url": "https://facebook.com/nikkei",
      "primary_phone": {
        "number": "+81 362-56-2793",
        "source": "Scraped",
        "sanitized_number": "+81362562793"
      },
      "languages": [
        "Japanese",
        "Chinese"
      ],
      "alexa_ranking": 1583,
      "phone": "+81 362-56-2793",
      "linkedin_uid": "3335963",
      "founded_year": 1876,
      "publicly_traded_symbol": null,
      "publicly_traded_exchange": null,
      "logo_url": "https://zenprospect-production.s3.amazonaws.com/uploads/pictures/66de78ba1ad1eb00018e27a5/picture",
      "crunchbase_url": null,
      "primary_domain": "nikkei.com",
      "sanitized_phone": "+81362562793",
      "owned_by_organization_id": null,
      "intent_strength": null,
      "show_intent": true,
      "has_intent_signal_account": false,
      "intent_signal_account": null
    },
    {
      "id": "55f1fcddf3e5bb0be2000a92",
      "name": "Mitsui & Co., Ltd.",
      "website_url": "http://www.mitsui.com",
      "blog_url": null,
      "angellist_url": null,
      "linkedin_url": "http://www.linkedin.com/company/mitsui-co-ltd-",
      "twitter_url": "https://twitter.com/citra_citrasa",
      "facebook_url": "https://facebook.com/mitsuiandco/",
      "primary_phone": {
        "number": "+81 3328-5-1111",
        "source": "Owler",
        "sanitized_number": "+81332851111"
      },
      "languages": [],
      "alexa_ranking": 265731,
      "phone": "+81 3328-5-1111",
      "linkedin_uid": "6675",
      "founded_year": 1947,
      "publicly_traded_symbol": "8031",
      "publicly_traded_exchange": "tyo",
      "logo_url": "https://zenprospect-production.s3.amazonaws.com/uploads/pictures/66da87a3b12bcc0001042a77/picture",
      "crunchbase_url": null,
      "primary_domain": "mitsui.com",
      "sanitized_phone": "+81332851111",
      "owned_by_organization_id": null,
      "intent_strength": null,
      "show_intent": true,
      "has_intent_signal_account": false,
      "intent_signal_account": null
    }
  ],
  "model_ids": [
    "615d029256de500001bdb460",
    "55f1fcddf3e5bb0be2000a92"
  ],
  "num_fetch_result": null,
  "derived_params": null
}

curl --request GET \
     --url https://api.apollo.io/api/v1/organizations/enrich \
     --header 'Cache-Control: no-cache' \
     --header 'Content-Type: application/json' \
     --header 'accept: application/json'

Thông tin nhận được:
{
  "organization": {
    "id": "5e66b6381e05b4008c8331b8",
    "name": "Apollo.io",
    "website_url": "http://www.apollo.io",
    "blog_url": null,
    "angellist_url": null,
    "linkedin_url": "http://www.linkedin.com/company/apolloio",
    "twitter_url": "https://twitter.com/meetapollo/",
    "facebook_url": "https://www.facebook.com/MeetApollo",
    "primary_phone": {},
    "languages": [],
    "alexa_ranking": 3514,
    "phone": null,
    "linkedin_uid": "18511550",
    "founded_year": 2015,
    "publicly_traded_symbol": null,
    "publicly_traded_exchange": null,
    "logo_url": "https://zenprospect-production.s3.amazonaws.com/uploads/pictures/66d13c8d98ec9600013525b8/picture",
    "crunchbase_url": null,
    "primary_domain": "apollo.io",
    "industry": "information technology & services",
    "keywords": [
      "sales engagement",
      "lead generation",
      "predictive analytics",
      "lead scoring",
      "sales strategy",
      "conversation intelligence",
      "sales enablement",
      "lead routing",
      "sales development",
      "email engagement",
      "revenue intelligence",
      "sales operations",
      "sales intelligence",
      "lead intelligence",
      "prospecting",
      "b2b data"
    ],
    "estimated_num_employees": 1600,
    "industries": [
      "information technology & services"
    ],
    "secondary_industries": [],
    "snippets_loaded": true,
    "industry_tag_id": "5567cd4773696439b10b0000",
    "industry_tag_hash": {
      "information technology & services": "5567cd4773696439b10b0000"
    },
    "retail_location_count": 0,
    "raw_address": "415 Mission St, Floor 37, San Francisco, California 94105, US",
    "street_address": "415 Mission St",
    "city": "San Francisco",
    "state": "California",
    "postal_code": "94105-2301",
    "country": "United States",
    "owned_by_organization_id": null,
    "seo_description": "Search, engage, and convert over 275 million contacts at over 73 million companies with Apollo's sales intelligence and engagement platform.",
    "short_description": "Apollo.io combines a buyer database of over 270M contacts and powerful sales engagement and automation tools in one, easy to use platform. Trusted by over 160,000 companies including Autodesk, Rippling, Deel, Jasper.ai, Divvy, and Heap, Apollo has more than one million users globally. By helping sales professionals find their ideal buyers and intelligently automate outreach, Apollo helps go-to-market teams sell anything.\n\nCelebrating a $100M Series D Funding Round 🦄",
    "suborganizations": [],
    "num_suborganizations": 0,
    "annual_revenue_printed": "100M",
    "annual_revenue": 100000000,
    "total_funding": 251200000,
    "total_funding_printed": "251.2M",
    "latest_funding_round_date": "2023-08-01T00:00:00.000+00:00",
    "latest_funding_stage": "Series D",
    "funding_events": [
      {
        "id": "6574c1ff9b797d0001fdab1b",
        "date": "2023-08-01T00:00:00.000+00:00",
        "news_url": null,
        "type": "Series D",
        "investors": "Bain Capital Ventures, Sequoia Capital, Tribe Capital, Nexus Venture Partners",
        "amount": "100M",
        "currency": "$"
      },
      {
        "id": "624f4dfec786590001768016",
        "date": "2022-03-01T00:00:00.000+00:00",
        "news_url": null,
        "type": "Series C",
        "investors": "Sequoia Capital, Tribe Capital, Nexus Venture Partners, NewView Capital",
        "amount": "110M",
        "currency": "$"
      },
      {
        "id": "61b13677623110000186a478",
        "date": "2021-10-01T00:00:00.000+00:00",
        "news_url": null,
        "type": "Series B",
        "investors": "Tribe Capital, NewView Capital, Nexus Venture Partners",
        "amount": "32M",
        "currency": "$"
      },
      {
        "id": "5ffe93caa54d75077c59acef",
        "date": "2018-06-26T00:00:00.000+00:00",
        "news_url": "https://techcrunch.com/2018/06/26/yc-grad-zenprospect-rebrands-as-apollo-lands-7-m-series-a/",
        "type": "Series A",
        "investors": "Nexus Venture Partners, Social Capital, Y Combinator",
        "amount": "7M",
        "currency": "$"
      },
      {
        "id": "6574c1ff9b797d0001fdab20",
        "date": "2016-10-01T00:00:00.000+00:00",
        "news_url": null,
        "type": "Other",
        "investors": "Y Combinator, SV Angel, Social Capital, Nexus Venture Partners",
        "amount": "2.2M",
        "currency": "$"
      }
    ],
    "technology_names": [
      "AI",
      "Android",
      "Basis",
      "Canva",
      "Circle",
      "CloudFlare Hosting",
      "Cloudflare DNS",
      "Drift",
      "Gmail",
      "Google Apps",
      "Google Tag Manager",
      "Google Workspace",
      "Gravity Forms",
      "Hubspot",
      "Intercom",
      "Mailchimp Mandrill",
      "Marketo",
      "Microsoft Office 365",
      "Mobile Friendly",
      "Python",
      "Rackspace MailGun",
      "Remote",
      "Render",
      "Reviews",
      "Salesforce",
      "Stripe",
      "Typekit",
      "WP Engine",
      "Wistia",
      "WordPress.org",
      "Yandex Metrica",
      "reCAPTCHA"
    ],
    "current_technologies": [
      {
        "uid": "ai",
        "name": "AI",
        "category": "Other"
      },
      {
        "uid": "android",
        "name": "Android",
        "category": "Frameworks and Programming Languages"
      },
      {
        "uid": "basis",
        "name": "Basis",
        "category": "Advertising Networks"
      },
      {
        "uid": "canva",
        "name": "Canva",
        "category": "Content Management Platform"
      },
      {
        "uid": "circle",
        "name": "Circle",
        "category": "Financial Software"
      },
      {
        "uid": "cloudflare_hosting",
        "name": "CloudFlare Hosting",
        "category": "Hosting"
      },
      {
        "uid": "cloudflare_dns",
        "name": "Cloudflare DNS",
        "category": "Domain Name Services"
      },
      {
        "uid": "drift",
        "name": "Drift",
        "category": "Widgets"
      },
      {
        "uid": "gmail",
        "name": "Gmail",
        "category": "Email Providers"
      },
      {
        "uid": "google_apps",
        "name": "Google Apps",
        "category": "Other"
      },
      {
        "uid": "google_tag_manager",
        "name": "Google Tag Manager",
        "category": "Tag Management"
      },
      {
        "uid": "google workspace",
        "name": "Google Workspace",
        "category": "Cloud Services"
      },
      {
        "uid": "gravity_forms",
        "name": "Gravity Forms",
        "category": "Hosted Forms"
      },
      {
        "uid": "hubspot",
        "name": "Hubspot",
        "category": "Marketing Automation"
      },
      {
        "uid": "intercom",
        "name": "Intercom",
        "category": "Support and Feedback"
      },
      {
        "uid": "mailchimp_mandrill",
        "name": "Mailchimp Mandrill",
        "category": "Email Delivery"
      },
      {
        "uid": "marketo",
        "name": "Marketo",
        "category": "Marketing Automation"
      },
      {
        "uid": "office_365",
        "name": "Microsoft Office 365",
        "category": "Other"
      },
      {
        "uid": "mobile_friendly",
        "name": "Mobile Friendly",
        "category": "Other"
      },
      {
        "uid": "python",
        "name": "Python",
        "category": "Frameworks and Programming Languages"
      },
      {
        "uid": "rackspace_mailgun",
        "name": "Rackspace MailGun",
        "category": "Email Delivery"
      },
      {
        "uid": "remote",
        "name": "Remote",
        "category": "Other"
      },
      {
        "uid": "render",
        "name": "Render",
        "category": "Other"
      },
      {
        "uid": "reviews",
        "name": "Reviews",
        "category": "Customer Reviews"
      },
      {
        "uid": "salesforce",
        "name": "Salesforce",
        "category": "Customer Relationship Management"
      },
      {
        "uid": "stripe",
        "name": "Stripe",
        "category": "Payments"
      },
      {
        "uid": "typekit",
        "name": "Typekit",
        "category": "Fonts"
      },
      {
        "uid": "wp_engine",
        "name": "WP Engine",
        "category": "CMS"
      },
      {
        "uid": "wistia",
        "name": "Wistia",
        "category": "Online Video Platforms"
      },
      {
        "uid": "wordpress_org",
        "name": "WordPress.org",
        "category": "CMS"
      },
      {
        "uid": "yandex_metrika",
        "name": "Yandex Metrica",
        "category": "Analytics and Tracking"
      },
      {
        "uid": "recaptcha",
        "name": "reCAPTCHA",
        "category": "Captcha"
      }
    ],
    "org_chart_root_people_ids": [
      "652fc57e2802bf00010c52f8"
    ],
    "org_chart_sector": "OrgChart::SectorHierarchy::Rules::IT",
    "org_chart_removed": false,
    "org_chart_show_department_filter": true,
    "account_id": "63f53afe4ceeca00016bdd37",
    "account": {
      "id": "63f53afe4ceeca00016bdd37",
      "domain": "apollo.io",
      "name": "Apollo",
      "team_id": "6095a710bd01d100a506d4ac",
      "organization_id": "5e66b6381e05b4008c8331b8",
      "account_stage_id": null,
      "source": "salesforce",
      "original_source": "salesforce",
      "creator_id": null,
      "owner_id": "60affe7d6e270a00f5db6fe4",
      "created_at": "2023-02-21T21:43:26.351Z",
      "phone": "+1(202) 374-1312",
      "phone_status": "no_status",
      "hubspot_id": null,
      "salesforce_id": null,
      "crm_owner_id": null,
      "parent_account_id": null,
      "linkedin_url": null,
      "sanitized_phone": "+12023741312",
      "account_playbook_statuses": [],
      "account_rule_config_statuses": [],
      "existence_level": "full",
      "label_ids": [
        "6504905b21ba8e00a334eb0f"
      ],
      "typed_custom_fields": {},
      "custom_field_errors": {},
      "modality": "account",
      "source_display_name": "Imported from Salesforce",
      "crm_record_url": null,
      "intent_strength": null,
      "show_intent": false,
      "has_intent_signal_account": false,
      "intent_signal_account": null
    },
    "departmental_head_count": {
      "engineering": 228,
      "operations": 28,
      "support": 30,
      "marketing": 36,
      "human_resources": 29,
      "sales": 177,
      "finance": 8,
      "consulting": 8,
      "legal": 5,
      "arts_and_design": 27,
      "accounting": 3,
      "business_development": 14,
      "information_technology": 8,
      "education": 6,
      "media_and_commmunication": 3,
      "product_management": 16,
      "entrepreneurship": 3,
      "data_science": 6,
      "administrative": 3
    }
  }
}

curl --request POST \
     --url https://api.apollo.io/api/v1/mixed_people/api_search \
     --header 'Cache-Control: no-cache' \
     --header 'Content-Type: application/json' \
     --header 'accept: application/json'

Thông tin nhận được:
{
  "total_entries": 232764882,
  "people": [
    {
      "id": "67bdafd0c3a4c50001bbd7c2",
      "first_name": "Andrew",
      "last_name_obfuscated": "Hu***n",
      "title": "Professor and Neuroscientist at Stanford & Host",
      "last_refreshed_at": "2025-11-04T23:20:32.690+00:00",
      "has_email": true,
      "has_city": true,
      "has_state": true,
      "has_country": true,
      "has_direct_phone": "Yes",
      "organization": {
        "name": "Scicomm Media",
        "has_industry": true,
        "has_phone": false,
        "has_city": true,
        "has_state": true,
        "has_country": true,
        "has_zip_code": false,
        "has_revenue": false,
        "has_employee_count": true
      }
    },
    {
      "id": "6775057df8360a0001a6852c",
      "first_name": "Jon",
      "last_name_obfuscated": "St***g",
      "title": "Managing Director",
      "last_refreshed_at": "2025-11-05T15:56:08.901+00:00",
      "has_email": true,
      "has_city": true,
      "has_state": true,
      "has_country": true,
      "has_direct_phone": "Yes",
      "organization": {
        "name": "Lazard",
        "has_industry": true,
        "has_phone": true,
        "has_city": true,
        "has_state": true,
        "has_country": true,
        "has_zip_code": true,
        "has_revenue": true,
        "has_employee_count": true
      }
    },
    {
      "id": "637dd5071c576c0001ccbff4",
      "first_name": "Lorena",
      "last_name_obfuscated": "Ac***a",
      "title": "Director of Operations",
      "last_refreshed_at": "2025-11-03T10:01:50.493+00:00",
      "has_email": true,
      "has_city": true,
      "has_state": true,
      "has_country": true,
      "has_direct_phone": "Yes",
      "organization": {
        "name": "Be Busy Being Awesome",
        "has_industry": true,
        "has_phone": false,
        "has_city": true,
        "has_state": true,
        "has_country": true,
        "has_zip_code": false,
        "has_revenue": false,
        "has_employee_count": true
      }
    },
    {
      "id": "6282fecea784280001553642",
      "first_name": "Linda",
      "last_name_obfuscated": "Ch***n",
      "title": "Sales Manager",
      "last_refreshed_at": "2025-09-29T11:53:35.791+00:00",
      "has_email": true,
      "has_city": true,
      "has_state": true,
      "has_country": true,
      "has_direct_phone": "Yes",
      "organization": {
        "name": "MCU Technology Co., Ltd",
        "has_industry": true,
        "has_phone": true,
        "has_city": false,
        "has_state": false,
        "has_country": false,
        "has_zip_code": false,
        "has_revenue": false,
        "has_employee_count": true
      }
    },
    {
      "id": "66ed23831ae8c9000186c75b",
      "first_name": "Nicholas",
      "last_name_obfuscated": "Th***n",
      "title": "Chief Executive Officer",
      "last_refreshed_at": "2025-11-07T17:08:51.086+00:00",
      "has_email": true,
      "has_city": true,
      "has_state": true,
      "has_country": true,
      "has_direct_phone": "Yes",
      "organization": {
        "name": "The Atlantic",
        "has_industry": true,
        "has_phone": true,
        "has_city": true,
        "has_state": true,
        "has_country": true,
        "has_zip_code": true,
        "has_revenue": true,
        "has_employee_count": true
      }
    },
    {
      "id": "6728af09afa3de00011a722e",
      "first_name": "Ron",
      "last_name_obfuscated": "Kr***i",
      "title": null,
      "last_refreshed_at": "2025-11-05T23:23:13.047+00:00",
      "has_email": true,
      "has_city": true,
      "has_state": true,
      "has_country": true,
      "has_direct_phone": "Yes",
      "organization": {
        "name": "Stifel Financial Corp.",
        "has_industry": true,
        "has_phone": true,
        "has_city": true,
        "has_state": true,
        "has_country": true,
        "has_zip_code": true,
        "has_revenue": true,
        "has_employee_count": true
      }
    },
    {
      "id": "54a2b92a74686935beffa837",
      "first_name": "Rita",
      "last_name_obfuscated": "Ki***g",
      "title": "Founder",
      "last_refreshed_at": "2025-11-07T07:13:05.197+00:00",
      "has_email": true,
      "has_city": false,
      "has_state": false,
      "has_country": true,
      "has_direct_phone": "Yes",
      "organization": {
        "name": "Power Pairs",
        "has_industry": true,
        "has_phone": false,
        "has_city": true,
        "has_state": true,
        "has_country": true,
        "has_zip_code": false,
        "has_revenue": false,
        "has_employee_count": true
      }
    },
    {
      "id": "63be196afa109b000139ace7",
      "first_name": "Austin",
      "last_name_obfuscated": "Be***k",
      "title": "Founder",
      "last_refreshed_at": "2025-11-02T05:22:18.569+00:00",
      "has_email": true,
      "has_city": true,
      "has_state": true,
      "has_country": true,
      "has_direct_phone": "Yes",
      "organization": {
        "name": "Cultivated Culture",
        "has_industry": true,
        "has_phone": true,
        "has_city": true,
        "has_state": true,
        "has_country": true,
        "has_zip_code": false,
        "has_revenue": false,
        "has_employee_count": true
      }
    },
    {
      "id": "5e8a7a4dfd23700001a64dfb",
      "first_name": "Elina",
      "last_name_obfuscated": "Ga***a",
      "title": "SVP, Head of Global Operations",
      "last_refreshed_at": "2025-11-05T13:50:24.941+00:00",
      "has_email": true,
      "has_city": true,
      "has_state": true,
      "has_country": true,
      "has_direct_phone": "Yes",
      "organization": {
        "name": "Twelve",
        "has_industry": true,
        "has_phone": true,
        "has_city": true,
        "has_state": true,
        "has_country": true,
        "has_zip_code": true,
        "has_revenue": true,
        "has_employee_count": true
      }
    },
    {
      "id": "66ec0684cd386c0001b15096",
      "first_name": "Matt",
      "last_name_obfuscated": "Gr***y",
      "title": "Founder & CEO",
      "last_refreshed_at": "2025-11-06T15:08:56.795+00:00",
      "has_email": true,
      "has_city": true,
      "has_state": true,
      "has_country": true,
      "has_direct_phone": "Yes",
      "organization": {
        "name": "Founder OS",
        "has_industry": true,
        "has_phone": true,
        "has_city": true,
        "has_state": true,
        "has_country": true,
        "has_zip_code": true,
        "has_revenue": false,
        "has_employee_count": true
      }
    }
  ]
}