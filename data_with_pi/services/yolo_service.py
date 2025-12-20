"""
YOLO Service for Leaf Detection
Handles real-time leaf detection on video stream
"""
import cv2
import numpy as np
from ultralytics import YOLO
from django.conf import settings
import os
import base64
import requests
from io import BytesIO
from PIL import Image
import logging

logger = logging.getLogger(__name__)

class YOLOLeafDetector:
    def __init__(self):
        self.model_path = os.path.join(settings.BASE_DIR, 'model', 'best.pt')
        self.model = None
        self.load_model()
    
    def load_model(self):
        """Load YOLO model"""
        try:
            if os.path.exists(self.model_path):
                self.model = YOLO(self.model_path)
                logger.info(f"YOLO model loaded successfully from {self.model_path}")
            else:
                logger.error(f"YOLO model not found at {self.model_path}")
        except Exception as e:
            logger.error(f"Failed to load YOLO model: {str(e)}")
            self.model = None
    
    def capture_frame_from_stream(self, stream_url):
        """
        Capture a single frame from Pi stream using OpenCV VideoCapture
        Returns OpenCV image (numpy array) or None if failed
        """
        cap = None
        try:
            logger.info(f"Connecting to stream with OpenCV: {stream_url}")
            
            # Use OpenCV to capture from stream
            cap = cv2.VideoCapture(stream_url)
            
            # Set timeout and buffer size
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Reduce buffer to get latest frame
            
            if not cap.isOpened():
                logger.error("Failed to open stream with OpenCV")
                return None
            
            # Read frame
            ret, frame = cap.read()
            
            if ret and frame is not None:
                logger.info(f"Successfully captured frame: {frame.shape}")
                return frame
            else:
                logger.error("Failed to read frame from stream")
                return None
                
        except Exception as e:
            logger.error(f"OpenCV capture error: {str(e)}")
            return None
        finally:
            if cap is not None:
                cap.release()
                logger.info("Released OpenCV VideoCapture")

    def detect_leaves_from_url(self, image_url, confidence_threshold=0.5):
        """
        Detect leaves from image URL (stream)
        Returns list of bounding boxes with coordinates and confidence
        """
        logger.info(f"=== YOLO DETECT FROM URL START ===")
        logger.info(f"Image URL: {image_url}")
        logger.info(f"Confidence threshold: {confidence_threshold}")
        
        if not self.model:
            logger.error("YOLO model not loaded")
            return {"success": False, "error": "YOLO model not loaded"}
        
        try:
            # Capture frame from stream using OpenCV
            logger.info("Capturing frame from Pi stream with OpenCV...")
            image_cv = self.capture_frame_from_stream(image_url)
            
            if image_cv is None:
                logger.error("Failed to capture frame from stream")
                return {"success": False, "error": "Cannot capture frame from stream"}
            
            logger.info("Frame captured successfully, proceeding with YOLO detection...")
            
            logger.info("Running YOLO detection...")
            # Run YOLO detection
            results = self.model(image_cv, conf=confidence_threshold)
            
            # Extract bounding boxes
            detections = []
            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    for box in boxes:
                        # Get coordinates (xyxy format)
                        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                        confidence = float(box.conf[0].cpu().numpy())
                        class_id = int(box.cls[0].cpu().numpy())
                        
                        detections.append({
                            'bbox': {
                                'x1': float(x1),
                                'y1': float(y1), 
                                'x2': float(x2),
                                'y2': float(y2),
                                'width': float(x2 - x1),
                                'height': float(y2 - y1)
                            },
                            'confidence': confidence,
                            'class_id': class_id,
                            'id': f"leaf_{len(detections)}"  # Unique ID for frontend
                        })
            
            # Convert image with annotations to base64 for preview
            annotated_image = self.draw_bounding_boxes(image_cv, detections)
            _, buffer = cv2.imencode('.jpg', annotated_image)
            annotated_b64 = base64.b64encode(buffer).decode('utf-8')
            
            return {
                "success": True,
                "detections": detections,
                "total_leaves": len(detections),
                "image_width": image_cv.shape[1],
                "image_height": image_cv.shape[0],
                "annotated_image_b64": annotated_b64
            }
            
        except Exception as e:
            logger.error(f"YOLO detection error: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def crop_leaf_from_stream(self, image_url, bbox):
        """
        Crop specific leaf from stream image based on bounding box
        Returns cropped image as base64
        """
        try:
            # Capture frame from stream using OpenCV (same as detection)
            logger.info(f"Capturing frame for cropping from: {image_url}")
            image_cv = self.capture_frame_from_stream(image_url)
            
            if image_cv is None:
                logger.error("Failed to capture frame for cropping")
                return {"success": False, "error": "Cannot capture frame from stream"}
            
            # Extract bounding box coordinates
            x1 = int(bbox['x1'])
            y1 = int(bbox['y1'])
            x2 = int(bbox['x2'])
            y2 = int(bbox['y2'])
            
            # Add padding (optional)
            padding = 10
            h, w = image_cv.shape[:2]
            x1 = max(0, x1 - padding)
            y1 = max(0, y1 - padding)
            x2 = min(w, x2 + padding)
            y2 = min(h, y2 + padding)
            
            # Crop image
            cropped = image_cv[y1:y2, x1:x2]
            
            if cropped.size == 0:
                return {"success": False, "error": "Invalid crop coordinates"}
            
            # Convert to base64
            _, buffer = cv2.imencode('.jpg', cropped)
            cropped_b64 = base64.b64encode(buffer).decode('utf-8')
            
            # Also create thumbnail
            thumbnail = cv2.resize(cropped, (200, 200))
            _, thumb_buffer = cv2.imencode('.jpg', thumbnail)
            thumbnail_b64 = base64.b64encode(thumb_buffer).decode('utf-8')
            
            return {
                "success": True,
                "cropped_image_b64": cropped_b64,
                "thumbnail_b64": thumbnail_b64,
                "crop_info": {
                    "original_bbox": bbox,
                    "cropped_size": {"width": x2-x1, "height": y2-y1}
                }
            }
            
        except Exception as e:
            logger.error(f"Crop leaf error: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def draw_bounding_boxes(self, image, detections):
        """Draw bounding boxes on image for preview"""
        annotated = image.copy()
        
        for i, detection in enumerate(detections):
            bbox = detection['bbox']
            confidence = detection['confidence']
            
            # Draw rectangle
            x1, y1 = int(bbox['x1']), int(bbox['y1'])
            x2, y2 = int(bbox['x2']), int(bbox['y2'])
            
            # Color based on confidence (green = high, yellow = medium, red = low)
            if confidence > 0.8:
                color = (0, 255, 0)  # Green
            elif confidence > 0.6:
                color = (0, 255, 255)  # Yellow
            else:
                color = (0, 0, 255)  # Red
            
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            
            # Add label
            label = f"Leaf {i+1}: {confidence:.2f}"
            cv2.putText(annotated, label, (x1, y1-10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
        
        return annotated

# Global instance
yolo_detector = YOLOLeafDetector()