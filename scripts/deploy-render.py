"""Use GitHub secrets in-process; never print API payloads or credentials."""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

def fail(message):
    print('::error::' + message)
    sys.exit(1)

key = os.environ.get('RENDER_API_KEY', '').strip()
database = os.environ.get('DATABASE_URL', '').strip()
if not key:
    fail('GitHub Actions secret Render_key is missing or unavailable.')
if not database:
    fail('GitHub Actions secret DATABASE_URL is missing or unavailable.')
if urllib.parse.urlsplit(database).scheme not in ('postgres', 'postgresql'):
    fail('DATABASE_URL must be a PostgreSQL connection URI.')

def api(method, path, body=None):
    req = urllib.request.Request('https://api.render.com/v1' + path,
        data=None if body is None else json.dumps(body).encode(), method=method,
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        # Response bodies can contain submitted env vars, so never log them.
        fail(f'Render API {method} {path.split("?")[0]} returned HTTP {error.code}. Check account verification, repository access and API key permissions in Render. No paid fallback was attempted.')
    except urllib.error.URLError:
        fail('Render API network error. No response body or credentials were logged.')

owner = os.environ.get('RENDER_OWNER_ID', '').strip()
if not owner:
    owners = api('GET', '/owners?limit=100')
    if len(owners) != 1:
        fail('Set repository variable RENDER_OWNER_ID to the intended Render workspace ID; automatic selection requires exactly one workspace.')
    owner = owners[0]['owner']['id']
repo = 'https://github.com/' + os.environ['GITHUB_REPOSITORY']
name = 'yonvi'
services = api('GET', '/services?' + urllib.parse.urlencode({'name': name, 'ownerId': owner, 'limit': 100}))
matches = [item['service'] for item in services if item['service']['name'] == name and item['service']['ownerId'] == owner]
if len(matches) > 1:
    fail('Multiple matching YONVI services found; refusing to choose one.')
values = {'DATABASE_URL': database, 'NODE_ENV': 'production', 'ALLOW_DEMO_AUTH': 'false', 'PORT': '10000'}
token = os.environ.get('MAX_YONVI_TOKEN', '').strip()
if token:
    values['MAX_YONVI_TOKEN'] = token
else:
    print('::warning::MAX_YONVI_TOKEN is unavailable; MAX authentication will remain unconfigured.')
if matches:
    service = matches[0]
    if service.get('repo', '').removesuffix('.git') != repo or service.get('type') != 'web_service':
        fail('Existing yonvi service does not match this repository and service type.')
    if service.get('serviceDetails', {}).get('plan') != 'free':
        fail('Existing yonvi service is not on the free plan; refusing to deploy.')
    sid = service['id']
    for env_key, value in values.items():
        api('PUT', '/services/' + sid + '/env-vars/' + env_key, {'value': value})
    deploy = api('POST', '/services/' + sid + '/deploys', {'commitId': os.environ['GITHUB_SHA']})
    deploy_id = deploy['id']
else:
    result = api('POST', '/services', {
        'type': 'web_service', 'name': name, 'ownerId': owner, 'repo': repo,
        'branch': 'main', 'autoDeployTrigger': 'off',
        'envVars': [{'key': k, 'value': v} for k, v in values.items()],
        'serviceDetails': {'runtime': 'docker', 'plan': 'free', 'region': 'frankfurt',
            'numInstances': 1, 'healthCheckPath': '/health',
            'envSpecificDetails': {'dockerfilePath': './deploy/Dockerfile.render', 'dockerContext': '.'}}})
    service = result['service']
    sid = service['id']
    deploy_id = result.get('deployId')
    if not deploy_id:
        deployments = api('GET', '/services/' + sid + '/deploys?limit=1')
        if not deployments:
            fail('Service created but no deployment was returned. Check Render dashboard.')
        deploy_id = deployments[0]['deploy']['id']
print('Render free service: ' + sid)
with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
    summary.write('YONVI service: `' + sid + '`\n\nPlan: **free**\n\n')
for attempt in range(100):
    deploy = api('GET', '/services/' + sid + '/deploys/' + deploy_id)
    status = deploy['status']
    print('Deploy status: ' + status)
    if status == 'live':
        service = api('GET', '/services/' + sid)
        url = service['serviceDetails']['url']
        with urllib.request.urlopen(url + '/health', timeout=120) as response:
            health = json.load(response)
        if health.get('ok') is not True:
            fail('Deployment is live but health verification failed.')
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
            summary.write('HTTPS: ' + url + '\n\nHealth check passed.\n')
        print('YONVI HTTPS: ' + url)
        break
    if status in ('build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated'):
        fail('Render deployment ended with ' + status + '. Inspect Render build/runtime logs.')
    time.sleep(15)
else:
    fail('Deployment is still pending; inspect the Render dashboard.')
