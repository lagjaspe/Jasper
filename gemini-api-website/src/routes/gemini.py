import os
import json
import tempfile
import zipfile
import uuid
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request, send_file, session
import google.generativeai as genai

gemini_bp = Blueprint('gemini', __name__)

# Store for generated files (in production, use Redis or database)
generated_files = {}

def cleanup_old_files():
    """Remove files older than 1 hour"""
    current_time = datetime.now()
    to_remove = []
    for file_id, file_info in generated_files.items():
        if current_time - file_info['created_at'] > timedelta(hours=1):
            try:
                if os.path.exists(file_info['path']):
                    os.remove(file_info['path'])
                to_remove.append(file_id)
            except:
                pass
    for file_id in to_remove:
        del generated_files[file_id]

@gemini_bp.route('/configure', methods=['POST'])
def configure_api():
    """Configure Gemini API key"""
    try:
        data = request.json
        api_key = data.get('api_key')
        
        if not api_key:
            return jsonify({'error': 'API key is required'}), 400
        
        # Test the API key
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-pro')
        
        # Test with a simple prompt
        response = model.generate_content("Hello")
        
        # Store API key in session
        session['gemini_api_key'] = api_key
        
        return jsonify({'success': True, 'message': 'API key configured successfully'})
    
    except Exception as e:
        return jsonify({'error': f'Invalid API key: {str(e)}'}), 400

@gemini_bp.route('/chat', methods=['POST'])
def chat():
    """Send message to Gemini API"""
    try:
        # Check if API key is configured
        api_key = session.get('gemini_api_key')
        if not api_key:
            return jsonify({'error': 'API key not configured. Please configure it first.'}), 401
        
        data = request.json
        message = data.get('message', '')
        
        if not message:
            return jsonify({'error': 'Message is required'}), 400
        
        # Configure Gemini
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-pro')
        
        # Generate response
        response = model.generate_content(message)
        
        return jsonify({
            'response': response.text,
            'timestamp': datetime.now().isoformat()
        })
    
    except Exception as e:
        return jsonify({'error': f'Error generating response: {str(e)}'}), 500

@gemini_bp.route('/generate-code', methods=['POST'])
def generate_code():
    """Generate code files using Gemini API"""
    try:
        # Check if API key is configured
        api_key = session.get('gemini_api_key')
        if not api_key:
            return jsonify({'error': 'API key not configured. Please configure it first.'}), 401
        
        data = request.json
        prompt = data.get('prompt', '')
        project_type = data.get('project_type', 'general')
        language = data.get('language', 'python')
        
        if not prompt:
            return jsonify({'error': 'Prompt is required'}), 400
        
        # Configure Gemini
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-pro')
        
        # Create structured prompt for code generation
        structured_prompt = f"""
        Generate {language} code for the following request: {prompt}
        
        Project type: {project_type}
        
        Please provide:
        1. Complete, working code
        2. Clear comments explaining the functionality
        3. If multiple files are needed, separate them clearly with file names
        4. Include any necessary imports or dependencies
        5. Provide a brief explanation of how to run the code
        
        Format your response as follows:
        FILENAME: filename.ext
        ```{language}
        [code content]
        ```
        
        EXPLANATION:
        [Brief explanation of the code and how to run it]
        """
        
        # Generate response
        response = model.generate_content(structured_prompt)
        
        # Parse the response to extract files
        files = parse_code_response(response.text, language)
        
        # Create temporary files
        file_id = str(uuid.uuid4())
        temp_dir = tempfile.mkdtemp()
        
        if len(files) == 1:
            # Single file
            file_path = os.path.join(temp_dir, files[0]['filename'])
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(files[0]['content'])
            
            generated_files[file_id] = {
                'path': file_path,
                'filename': files[0]['filename'],
                'type': 'single',
                'created_at': datetime.now()
            }
        else:
            # Multiple files - create ZIP
            zip_path = os.path.join(temp_dir, f'{project_type}_project.zip')
            with zipfile.ZipFile(zip_path, 'w') as zipf:
                for file_info in files:
                    zipf.writestr(file_info['filename'], file_info['content'])
            
            generated_files[file_id] = {
                'path': zip_path,
                'filename': f'{project_type}_project.zip',
                'type': 'zip',
                'created_at': datetime.now()
            }
        
        # Cleanup old files
        cleanup_old_files()
        
        return jsonify({
            'file_id': file_id,
            'filename': generated_files[file_id]['filename'],
            'files': [{'filename': f['filename'], 'preview': f['content'][:500] + '...' if len(f['content']) > 500 else f['content']} for f in files],
            'response': response.text,
            'download_url': f'/api/download/{file_id}'
        })
    
    except Exception as e:
        return jsonify({'error': f'Error generating code: {str(e)}'}), 500

@gemini_bp.route('/download/<file_id>', methods=['GET'])
def download_file(file_id):
    """Download generated file"""
    try:
        if file_id not in generated_files:
            return jsonify({'error': 'File not found or expired'}), 404
        
        file_info = generated_files[file_id]
        
        if not os.path.exists(file_info['path']):
            return jsonify({'error': 'File not found'}), 404
        
        return send_file(
            file_info['path'],
            as_attachment=True,
            download_name=file_info['filename']
        )
    
    except Exception as e:
        return jsonify({'error': f'Error downloading file: {str(e)}'}), 500

@gemini_bp.route('/files', methods=['GET'])
def list_files():
    """List generated files"""
    try:
        cleanup_old_files()
        
        files_list = []
        for file_id, file_info in generated_files.items():
            files_list.append({
                'id': file_id,
                'filename': file_info['filename'],
                'type': file_info['type'],
                'created_at': file_info['created_at'].isoformat(),
                'download_url': f'/api/download/{file_id}'
            })
        
        return jsonify({'files': files_list})
    
    except Exception as e:
        return jsonify({'error': f'Error listing files: {str(e)}'}), 500

def parse_code_response(response_text, language):
    """Parse Gemini response to extract code files"""
    files = []
    lines = response_text.split('\n')
    current_file = None
    current_content = []
    in_code_block = False
    
    for line in lines:
        if line.startswith('FILENAME:'):
            # Save previous file if exists
            if current_file and current_content:
                files.append({
                    'filename': current_file,
                    'content': '\n'.join(current_content)
                })
            
            # Start new file
            current_file = line.replace('FILENAME:', '').strip()
            current_content = []
            in_code_block = False
            
        elif line.startswith('```'):
            in_code_block = not in_code_block
            if not in_code_block and current_file:
                # End of code block
                continue
                
        elif in_code_block and current_file:
            current_content.append(line)
    
    # Save last file
    if current_file and current_content:
        files.append({
            'filename': current_file,
            'content': '\n'.join(current_content)
        })
    
    # If no files were parsed, treat entire response as single file
    if not files:
        extension = get_file_extension(language)
        files.append({
            'filename': f'generated_code.{extension}',
            'content': response_text
        })
    
    return files

def get_file_extension(language):
    """Get file extension for programming language"""
    extensions = {
        'python': 'py',
        'javascript': 'js',
        'html': 'html',
        'css': 'css',
        'java': 'java',
        'cpp': 'cpp',
        'c': 'c',
        'go': 'go',
        'rust': 'rs',
        'php': 'php',
        'ruby': 'rb',
        'swift': 'swift',
        'kotlin': 'kt',
        'typescript': 'ts'
    }
    return extensions.get(language.lower(), 'txt')

