import { useState, useEffect, useRef } from 'react';
import './index.css';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import MarkdownIt from 'markdown-it';
import { maybeShowApiKeyBanner } from '../gemini-api-banner';
import RecyclingIcon from './assets/icons';

// Move the API key to a secure environment variable in a real application

function App() {
  const [location, setLocation] = useState('');
  const [output, setOutput] = useState('(Results will appear here)');
  const [outputColor, setOutputColor] = useState(''); // Tracks output div color
  const [showOutput, setShowOutput] = useState(false); // Tracks if outputDiv should be displayed
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
    setOutputColor(''); // Reset output color
    setShowOutput(true); // Show outputDiv after submission

    if (!capturedImage) {
      alert("Please capture an image before submitting.");
      return;
    }

    try {
      const contents = [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: capturedImage } },
          { text: `The user is in ${location}. Identify whether the object in the image is recyclable in recycling bins (can be thrown in any recycling bin) based on that location's recycling regulations. Respond simply with "This is a (object)" and "Yes, this is recyclable!" or "No, this isn't recyclable" along with a one sentence explanation of why it is or is not recyclable in the given location in a way that would be understandable to a middle school student. If the location is not a real location, respond with "This location does not exist. Please enter a valid location.", even if the image uploaded is valid.` }
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
        const finalOutput = buffer.join('');
        setOutput(md.render(finalOutput));

        // Check for "yes" or "no" in the response and change the output color
        if (finalOutput.toLowerCase().includes("yes")) {
          setOutputColor("#b0e57c"); // Light green
        } else if (finalOutput.toLowerCase().includes("no")) {
          setOutputColor("#ffb6b6"); // Light red
        }
      }
    } catch (e) {
      setOutput(prev => prev + '<hr>' + e);
    }
  };

  return (
    <>
      <div className="app-container">
        <div className="header">
          <div className="logo-container">
            <RecyclingIcon sx={{ fontSize: 48, marginRight: '8px'  }} className="logo-icon" />
            <span className="logo-text">RecycAI</span>
          </div>
        </div>
        <main>
          <div className="mainFormDiv">
            <h1>Find out if your item is recyclable!</h1>

            {/* Button to show camera */}
            {!cameraVisible && !capturedImage && (
              <button onClick={startCamera}>Take Picture</button>
            )}

            {/* Camera preview - Initially hidden */}
            <div className="camera-container" style={{ display: cameraVisible ? 'flex' : 'none' }}>
              <video className="pictureBefore" ref={videoRef} autoPlay playsInline></video>
              <button onClick={captureImage}>
              <svg className="cameraIcon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
                  <path fill= "#f8fff5dd" d="M149.1 64.8L138.7 96 64 96C28.7 96 0 124.7 0 160L0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-256c0-35.3-28.7-64-64-64l-74.7 0L362.9 64.8C356.4 45.2 338.1 32 317.4 32L194.6 32c-20.7 0-39 13.2-45.5 32.8zM256 192a96 96 0 1 1 0 192 96 96 0 1 1 0-192z"/>
                </svg>
              </button>
            </div>

            {/* Display captured image */}
            {capturedImage && (
              <>
                <img className="pictureAfter" src={`data:image/jpeg;base64,${capturedImage}`} alt="Captured preview" />
                <button onClick={() => { setCapturedImage(null); startCamera(); }}>Retake</button>
              </>
            )}

            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

            <form className="form" onSubmit={handleSubmit}>
              <div className="prompt-box">
                <input
                  className="prompt"
                  placeholder="Enter location here"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
                <button type="submit" className="submitButton">
                <svg className="submit-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path fill="#f8fff5dd" d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
                </button>

              </div>
            </form>
          </div>

          {/* Output with Conditional Display */}
          {showOutput && (
            <div className="outputDiv" style={{ backgroundColor: outputColor }}>
              <p className="output" dangerouslySetInnerHTML={{ __html: output }} />
            </div>
          )}
        </main>
      </div>
    </>
  );
}

export default App;
