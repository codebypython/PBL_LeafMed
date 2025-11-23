from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('data_with_pi', '0005_captureresult_local_image_captureresult_source_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='plant',
            name='vietnamese_name',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='plant',
            name='description',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='plant',
            name='usage',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='plant',
            name='common_locations',
            field=models.TextField(blank=True, default=''),
        ),
    ]

