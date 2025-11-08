- Python 3.11+ 
- PostgreSQL 15+ (hoặc SQLite cho development)
- pip (Python package manager)

then do those step

python -m venv .venv
.venv\Scripts\activate 

#change ..._requirements.txt file to "requirement.txt" and use it
pip install -r requirements.txt

copy .env.example .env #chỉnh sửa thông tin cần thiết trong .env sau khi tạo

python manage.py migrate
python manage.py seed_plants

python manage.py runserver