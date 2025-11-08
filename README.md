- Python 3.11+ 
- PostgreSQL 15+ (hoặc SQLite cho development)
- pip (Python package manager)

Sau khi đáp ứng được môi trường cần thiết hãy làm theo các bước sau

- python -m venv .venv
- .venv\Scripts\activate 

#thay đổi file ..._requirements.txt thành "requirement.txt" và sử dụng nó
- pip install -r requirements.txt

- copy .env.example .env #chỉnh sửa thông tin cần thiết trong .env sau khi tạo

- python manage.py migrate
- python manage.py seed_plants

- python manage.py runserver