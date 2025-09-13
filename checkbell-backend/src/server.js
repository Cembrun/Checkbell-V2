To start the web application on a host, you need to ensure that the server is running and accessible. Based on the provided server.js file, you can start the application by executing the following command in your terminal:

1. Navigate to the directory where your server.js file is located.
2. Run the command: 

node backend/server.js

This will start the server on the specified port (4000). You can then access the application by navigating to http://localhost:4000 in your web browser. 

Make sure you have all the necessary dependencies installed (like express, cors, multer, bcrypt, etc.) by running:

npm install

If you want to run the server in a production environment, consider using a process manager like PM2 or Docker for better management.