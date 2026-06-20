import os
import django
import json
import urllib.request
import urllib.error

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'lab_backend.settings')
django.setup()

from lab.models import Test
from lab.views import TestDetailedSerializer
from accounts.models import LoginSession

session = LoginSession.objects.filter(username='admin').first()
if not session:
    print("No login session found!")
    exit(1)
token = session.token

test_obj = Test.objects.filter(id=2257).first()
serializer = TestDetailedSerializer(test_obj)
data = serializer.data

payload = {
    **data,
    'department': int(data['department']),
    'reagent_item': int(data['reagent_item']) if data.get('reagent_item') else None,
    'technology': int(data['technology']) if data.get('technology') else None,
    'rate': float(data['rate'] or 0),
    'default_discount_percent': float(data['default_discount_percent'] or 0),
    'default_amount': float(data['default_amount'] or 0),
}

req_data = json.dumps(payload).encode('utf-8')
url = 'http://localhost:8000/api/tests-detailed/2257/'

req = urllib.request.Request(url, data=req_data, method='PUT')
req.add_header('Authorization', f'Token {token}')
req.add_header('Content-Type', 'application/json')

try:
    with urllib.request.urlopen(req) as response:
        print("STATUS CODE:", response.status)
        print("RESPONSE BODY:", response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print("HTTP ERROR:", e.code)
    print("RESPONSE BODY:", e.read().decode('utf-8'))
except Exception as e:
    print("OTHER ERROR:", e)
