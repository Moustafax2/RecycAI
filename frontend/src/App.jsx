import { useState, useEffect, useRef } from 'react';
import './index.css';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import MarkdownIt from 'markdown-it';
import { maybeShowApiKeyBanner } from '../../backend/gemini-api-banner';


// Move the API key to a secure environment variable in a real application

function App() {
  const [location, setLocation] = useState('');
  const [output, setOutput] = useState('(Results will appear here)');
  const [cameraVisible, setCameraVisible] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const API_KEY = import.meta.env.VITE_API_KEY;
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  let streamRef = useRef(null);

  useEffect(() => {
    getUserLocation();
    maybeShowApiKeyBanner(API_KEY);
  }, []);

  const getUserLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
          .then(response => response.json())
          .then(data => {
            const city = data.address.city || data.address.town || data.address.village;
            const province = data.address.state;
            const country = data.address.country;
            if (city && province && country) {
              setLocation(`${city}, ${province}, ${country}`);
            }
          })
          .catch(error => console.error('Error fetching location details:', error));
      },
      (error) => {
        console.error("Error getting location:", error);
      }
    );
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraVisible(true);
    } catch (error) {
      console.error("Error accessing camera:", error);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraVisible(false);
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    // Capture image
    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
    
    setCapturedImage(base64Image);
    stopCamera(); // Hide camera after capturing
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setOutput('Generating...');

    if (!capturedImage) {
      alert("Please capture an image before submitting.");
      return;
    }

    try {
      const contents = [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: capturedImage } },
          { text: `The user is in ${location}. Identify whether the object in the image is recyclable based on that location's recycling regulations. Respond simply with "This is a (object)" and "Yes, this is recyclable!" or "No, this isn't recyclable" along with a one sentence explanation of why it is or is not recyclable in the given location in a way that would be understandable to a middle school student. If the location is not a real location, respond with "This location does not exist. Please enter a valid location.", even if the image uploaded is valid` }
        ]
      }];

      const genAI = new GoogleGenerativeAI(API_KEY);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        safetySettings: [{
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        }],
      });

      const result = await model.generateContentStream({ contents });

      let buffer = [];
      const md = new MarkdownIt();
      for await (let response of result.stream) {
        buffer.push(response.text());
        setOutput(md.render(buffer.join('')));
      }
    } catch (e) {
      setOutput(prev => prev + '<hr>' + e);
    }
  };

  return (
    <>
      <header>
        <div>RecycAI</div>
      </header>
      <main>
        <div className="mainFormDiv">
        <h1>Is This Product Recyclable?</h1>

        {/* Button to show camera */}
        {!cameraVisible && !capturedImage && (
          <button onClick={startCamera}>Take Picture</button>
        )}

        {/* Camera preview - Initially hidden */}
        <div className="camera-container" style={{ display: cameraVisible ? 'flex' : 'none' }}>
          <video ref={videoRef} autoPlay playsInline></video>
          <button onClick={captureImage}>Capture</button>
        </div>

        {/* Display captured image */}
        {capturedImage && (
          <>
            <img src={`data:image/jpeg;base64,${capturedImage}`} alt="Captured preview" />
            <button onClick={() => { setCapturedImage(null); startCamera(); }}>Retake</button>
          </>
        )}

        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

        <form className="form" onSubmit={handleSubmit}>
          <div className="prompt-box">
            <label>
              <input
                className="prompt"
                placeholder="Enter location here"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </label>
            <button type="submit">Go</button>
          </div>
        </form>
    
        </div>
        <div className="outputDiv">
          <p className="output" dangerouslySetInnerHTML={{ __html: output }} />
        </div>

      </main>
    </>
  );
}

export default App;
