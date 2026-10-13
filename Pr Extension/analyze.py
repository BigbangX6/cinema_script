import sys
import os
import json
import logging
import tempfile
import re
from datetime import datetime
import numpy as np
from scipy.io import wavfile

# --- 1. CONFIGURATION DES LOGS ---
system_temp_dir = tempfile.gettempdir()
LOG_DIR = os.path.join(system_temp_dir, "cinema_script_logs")
os.makedirs(LOG_DIR, exist_ok=True)

timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
pid = os.getpid()
log_filename = os.path.join(LOG_DIR, f"analyze_{timestamp}_{pid}.log")

logging.basicConfig(
    filename=log_filename,
    level=logging.DEBUG, 
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# --- 2. FONCTIONS DE DÉTECTION ---
def get_dtmf_char(low_freq, high_freq):
    dtmf_table = {
        (10697, 12209): '1', (10697, 12336): '2', (10697, 12477): '3',
        (10770, 12209): '4', (10770, 12336): '5', (10770, 12477): '6',
        (10852, 12209): '7', (10852, 12336): '8', (10852, 12477): '9',
        (10941, 12209): '*', (10941, 12336): '0', (10941, 12477): '#'
    }
    for (lf, hf), char in dtmf_table.items():
        #if abs(low_freq - lf) < 20 and abs(high_freq - hf) < 20:
        if abs(low_freq - lf) < 8 and abs(high_freq - hf) < 8:
            return char
    return None

def analyze_clap(file_path):
    logging.info(f"--- DÉMARRAGE DE L'ANALYSE (SYNC SUR #) ---")
    logging.info(f"Fichier cible : {file_path}")
    
    try:
        sample_rate, data = wavfile.read(file_path)
        logging.debug(f"Fichier lu avec succès. Fréquence d'échantillonnage : {sample_rate} Hz, Longueur : {len(data)} samples.")
        
        if len(data.shape) > 1:
            data = data.mean(axis=1)
            logging.debug("Conversion stéréo vers mono effectuée.")

        # 1. Utilisation du Transitoire comme point d'ancrage pour ignorer le bruit initial
        #peak_index = np.argmax(np.abs(data))
        #logging.info(f"Transitoire détecté à {peak_index / sample_rate:.4f}s. Saut des bruits parasites initiaux.")
        peak_index = 0
        
        # 2. Début du scan DTMF juste après le transitoire
        start_dtmf_idx = peak_index + int(0.065 * sample_rate)
        step = int(0.060 * sample_rate) 
        window = int(0.120 * sample_rate)
        
        payload = ""
        last_char = None
        sync_time_seconds = 0.0
        
        logging.debug(f"Début du scan DTMF à l'index {start_dtmf_idx}.")
        
        for i in range(start_dtmf_idx, len(data) - window, step):
            chunk = data[i:i+window]
            
            fft_result = np.abs(np.fft.rfft(chunk))
            freqs = np.fft.rfftfreq(len(chunk), 1/sample_rate)
            
            low_band = (freqs > 10650) & (freqs < 11000)
            high_band = (freqs > 12150) & (freqs < 12550)
            
            if not np.any(low_band) or not np.any(high_band): continue

            low_freq = freqs[low_band][np.argmax(fft_result[low_band])]
            high_freq = freqs[high_band][np.argmax(fft_result[high_band])]
            
            #if np.max(fft_result) > np.mean(fft_result) * 5:
            noise = np.median(fft_result) * 10
            if np.max(fft_result[low_band]) > noise and np.max(fft_result[high_band]) > noise:
                char = get_dtmf_char(low_freq, high_freq)
                if char and char != last_char:
                    payload += char
                    #last_char = char
                    
                    current_time = i / sample_rate
                    logging.debug(f"Caractère DTMF détecté : {char} (Fréq: {low_freq:.0f}Hz, {high_freq:.0f}Hz) à {current_time:.3f}s")
                    
                    if char == '*' and last_char =='#': 
                        # Capture du temps de synchronisation exact sur le dièse
                        sync_time_seconds = current_time
                        logging.info(f"Point de cut '#' détecté à {sync_time_seconds:.4f}s. Arrêt du scan.")
                        break

                    last_char = char
                    i+=step
            else:
                last_char = None

        logging.info(f"Payload brut extrait : '{payload}'")

        # 3. Extraction par motif sécurisé
        # Cherche le bloc *X*Y*Z# même si des caractères parasites l'entourent
        match = re.search(r'\*(\d+)\*(\d+)\*(\d+)#*', payload)

        if match:
            scene, shot, take = match.groups()
            
            result = {
                "status": "success",
                "sync_time_seconds": round(sync_time_seconds, 4),
                "metadata": {
                    "scene": scene,
                    "shot": shot,
                    "take": take
                },
                "raw_payload": payload,
                "log_file": log_filename
            }
            logging.info(f"Succès de l'analyse. Séquence {scene}, Plan {shot}, Prise {take}.")
        else:
            result = {
                "status": "error", 
                "message": "Format de données invalide", 
                "raw_payload": payload, 
                "log_file": log_filename
            }
            logging.error(f"Échec : Le motif exact *Scène*Plan*Prise# est introuvable dans '{payload}'.")

        # Sortie JSON stricte vers stdout
        output_json = json.dumps(result)
        logging.debug(f"Sortie stdout : {output_json}")
        print(output_json)

    except Exception as e:
        error_msg = f"Erreur critique lors de l'exécution : {str(e)}"
        logging.exception(error_msg)
        error_result = {"status": "error", "message": str(e), "log_file": log_filename}
        print(json.dumps(error_result))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        msg = "Aucun fichier WAV fourni en argument."
        logging.error(msg)
        print(json.dumps({"status": "error", "message": msg}))
    else:
        analyze_clap(sys.argv[1])