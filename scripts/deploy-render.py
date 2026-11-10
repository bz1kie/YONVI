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
neon_secret = os.environ.get('NEON', '').strip()
if not key:
    fail('GitHub Actions secret Render_key is missing or unavailable.')
if not database and neon_secret.startswith(('postgres://', 'postgresql://')):
    database = neon_secret
if not database and neon_secret:
    def neon(method, path, body=None):
        request = urllib.request.Request('https://console.neon.tech/api/v2' + path,
            data=None if body is None else json.dumps(body).encode(), method=method,
            headers={'Authorization': 'Bearer ' + neon_secret, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            fail(f'Neon API {method} {path.split("?")[0]} returned HTTP {error.code}. Check NEON API key permissions. Response body withheld.')
        except urllib.error.URLError:
            fail('Neon API network error. Credentials withheld.')
    organizations = neon('GET', '/users/me/organizations')['organizations']
    free_orgs = [org for org in organizations if org.get('plan', '').lower().startswith('free')]
    if len(free_orgs) != 1:
        fail('Neon requires exactly one accessible Free organization for automatic setup. No paid organization was selected.')
    org_id = free_orgs[0]['id']
    projects = neon('GET', '/projects?' + urllib.parse.urlencode({'org_id': org_id, 'search': 'yonvi', 'limit': 400}))
    if projects.get('unavailable'):
        fail('Neon project listing is incomplete; refusing to create a duplicate.')
    found = [p for p in projects['projects'] if p['name'] == 'yonvi']
    if len(found) > 1:
        fail('Multiple Neon yonvi projects found; refusing to choose a database.')
    if found:
        project = found[0]
        branches = neon('GET', '/projects/' + project['id'] + '/branches')['branches']
        defaults = [branch for branch in branches if branch.get('default')]
        if len(defaults) != 1:
            fail('Cannot identify the default branch in Neon yonvi project.')
        branch_id = defaults[0]['id']
        databases = neon('GET', '/projects/' + project['id'] + '/branches/' + branch_id + '/databases')['databases']
        preferred = [db for db in databases if db['name'] == 'yonvi']
        if not preferred and len(databases) == 1:
            preferred = databases
        if len(preferred) != 1:
            fail('Cannot identify the database in Neon yonvi project.')
        db = preferred[0]
        query = urllib.parse.urlencode({'branch_id': branch_id, 'database_name': db['name'], 'role_name': db['owner_name'], 'pooled': 'false'})
        database = neon('GET', '/projects/' + project['id'] + '/connection_uri?' + query)['uri']
    else:
        result = neon('POST', '/projects', {'project': {'name': 'yonvi', 'org_id': org_id,
            'pg_version': 17, 'region_id': 'aws-eu-central-1',
            'branch': {'name': 'main', 'database_name': 'yonvi', 'role_name': 'yonvi_owner'},
            'default_endpoint_settings': {'autoscaling_limit_min_cu': 0.25, 'autoscaling_limit_max_cu': 0.25, 'suspend_timeout_seconds': 300}}})
        project = result['project']
        database = result['connection_uris'][0]['connection_uri']
        # New compute provisioning is asynchronous. Do not attempt migrations until ready.
        for _ in range(60):
            endpoints = neon('GET', '/projects/' + project['id'] + '/endpoints')['endpoints']
            if endpoints and all(endpoint.get('current_state') in ('active', 'idle') and not endpoint.get('pending_state') for endpoint in endpoints):
                break
            time.sleep(5)
        else:
            fail('Neon project created but compute provisioning is still pending. Rerun the workflow later.')
    # Generated credentials are not GitHub secrets yet: register them for log redaction.
    print('::add-mask::' + database)
    print('Neon Free PostgreSQL configured: ' + project['id'])
if not database:
    fail('GitHub Actions secrets DATABASE_URL and NEON are missing or unavailable.')
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
