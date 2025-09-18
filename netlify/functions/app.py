import json
import sys
import os

# Add the parent directory to the path to import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app import app

def handler(event, context):
    """
    Netlify Functions handler for Flask app
    """
    try:
        # Get the HTTP method and path
        http_method = event.get('httpMethod', 'GET')
        path = event.get('path', '/')
        
        # Get query parameters
        query_params = event.get('queryStringParameters') or {}
        
        # Get headers
        headers = event.get('headers', {})
        
        # Get body
        body = event.get('body', '')
        
        # Create a test client
        with app.test_client() as client:
            # Make the request
            if http_method == 'GET':
                response = client.get(path, query_string=query_params, headers=headers)
            elif http_method == 'POST':
                response = client.post(path, data=body, headers=headers)
            elif http_method == 'PUT':
                response = client.put(path, data=body, headers=headers)
            elif http_method == 'DELETE':
                response = client.delete(path, headers=headers)
            else:
                response = client.get(path, query_string=query_params, headers=headers)
            
            # Return the response
            return {
                'statusCode': response.status_code,
                'headers': {
                    'Content-Type': response.content_type,
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
                },
                'body': response.get_data(as_text=True)
            }
            
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'error': str(e),
                'message': 'Internal server error'
            })
        }