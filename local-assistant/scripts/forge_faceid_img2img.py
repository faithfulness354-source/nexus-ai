"""
Reference FaceID img2img client for Stable Diffusion Forge on :7860.
The localhost:3010 bridge mirrors these locked parameters.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

import requests

FORGE_URL = "http://127.0.0.1:7860/sdapi/v1/img2img"


def generate_forge_image(input_image_path: str, prompt: str, negative_prompt: str) -> None:
    url = FORGE_URL

    with open(input_image_path, "rb") as img_file:
        encoded_image = base64.b64encode(img_file.read()).decode("utf-8")

    payload = {
        "init_images": [encoded_image],
        "resize_mode": 0,
        "denoising_strength": 0.38,
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "steps": 28,
        "cfg_scale": 6.5,
        "sampler_name": "DPM++ 2M Karras",
        "batch_size": 1,
        "n_iter": 1,
        "override_settings": {
            "sd_model_checkpoint": "Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors",
        },
        "override_settings_restore_afterwards": True,
        "alwayson_scripts": {
            "controlnet": {
                "args": [
                    {
                        "enabled": True,
                        # Forge UI name for A1111's ip-adapter_faceid
                        "module": "InsightFace+CLIP-H (IPAdapter)",
                        "model": "ip-adapter-faceid_sdxl",
                        "weight": 0.80,
                        "image": encoded_image,
                        "control_mode": "Balanced",
                        "resize_mode": "Crop and Resize",
                    }
                ]
            }
        },
    }

    response = requests.post(url, data=json.dumps(payload), headers={"Content-Type": "application/json"}, timeout=600)

    if response.status_code == 200:
        result = response.json()
        for index, image in enumerate(result["images"]):
            image_data = base64.b64decode(image)
            out = Path(f"output_{index}.png")
            out.write_bytes(image_data)
        print("Image generation successful and saved.")
    else:
        print(f"Error: {response.status_code} - {response.text}")


if __name__ == "__main__":
    test_prompt = (
        "Masterpiece, high-end 2.5D digital character illustration of a striking woman, "
        "intricate latex and lace outfit, soft cinematic studio lighting, volumetric shadows, "
        "rich depth of field, detailed facial features, photorealistic material textures."
    )
    test_negative = (
        "ugly, deformed, crosshatch, grid artifacts, flat lighting, 2d anime, "
        "lowres, jpeg artifacts, bald, distorted geometry."
    )
    # generate_forge_image("path_to_reference.jpg", test_prompt, test_negative)
    print("Edit __main__ to pass a reference image path, then run this script.")
