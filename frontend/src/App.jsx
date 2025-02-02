import { useState, useEffect } from 'react'
import './index.css'
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import MarkdownIt from 'markdown-it';
import { maybeShowApiKeyBanner } from '../../backend/gemini-api-banner';

// Move the API key to a secure environment variable in a real application

function App() {
  const [location, setLocation] = useState('');
  const [output, setOutput] = useState('(Results will appear here)');
  const API_KEY  = import.meta.env.VITE_API_KEY;

  useEffect(() => {
    // Get user location when component mounts
    getUserLocation();
    // Show API key banner if needed
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

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setOutput('Generating...');

    try {
      const fileInput = document.getElementById('fileInput');
      const file = fileInput.files[0];

      if (!file) {
        alert("Please select a file before submitting.");
        return;
      }

      const imageBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        };
        reader.onerror = reject;
      });

      const contents = [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
          { text: `The user is in ${location}. Identify whether the object in the image is recyclable based on that location's recycling regulations. Respond simply with "This is a (object)" and "Yes, this is recyclable!" or "No, this isnt recyclable" along with a short explanation of why it is or is not recyclable.` }
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
      <main>
        <h1>Recycle with the Gemini API</h1>
        <form onSubmit={handleSubmit}>
          <div className="image-picker">
            <input type="file" id="fileInput" name="file" />
          </div>
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
        <p className="output" dangerouslySetInnerHTML={{ __html: output }} />
      </main>
    </>
  )
}

export default App