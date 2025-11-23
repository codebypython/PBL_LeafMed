from django.db import migrations, models


def ensure_fields_exist(apps, schema_editor):
    """Đảm bảo các trường tồn tại trong database"""
    db_alias = schema_editor.connection.alias
    with schema_editor.connection.cursor() as cursor:
        # Kiểm tra và thêm các trường nếu chưa tồn tại
        fields_to_add = [
            ('vietnamese_name', 'varchar(255)', "DEFAULT '' NOT NULL"),
            ('description', 'text', "DEFAULT '' NOT NULL"),
            ('usage', 'text', "DEFAULT '' NOT NULL"),
            ('common_locations', 'text', "DEFAULT '' NOT NULL"),
        ]
        
        for field_name, field_type, default in fields_to_add:
            # Kiểm tra xem cột đã tồn tại chưa
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='data_with_pi_plant' AND column_name=%s
            """, [field_name])
            
            if not cursor.fetchone():
                # Thêm cột nếu chưa tồn tại
                cursor.execute(f"""
                    ALTER TABLE data_with_pi_plant 
                    ADD COLUMN {field_name} {field_type} {default}
                """)
                # Xóa DEFAULT sau khi thêm
                cursor.execute(f"""
                    ALTER TABLE data_with_pi_plant 
                    ALTER COLUMN {field_name} DROP DEFAULT
                """)


def reverse_ensure_fields(apps, schema_editor):
    """Reverse migration - không làm gì vì chỉ thêm các trường"""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('data_with_pi', '0008_add_english_name_to_plant'),
    ]

    operations = [
        migrations.RunPython(ensure_fields_exist, reverse_ensure_fields),
    ]

