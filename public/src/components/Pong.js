import React, { useEffect, useState, useRef } from 'react'; // Import React and necessary hooks

/**
 * Pong Component
 * - Handles rendering the Pong game using the HTML5 Canvas API.
 * - Updates paddle movement, ball position, and scores.
 * - Uses requestAnimationFrame for optimized rendering.
 * - Listens for keyboard and mouse input to move paddles.
 * 
 * Props:
 * @param {number} playerNumber - Identifies if the user is Player 1 or Player 2.
 * @param {number} playerPosition - Current paddle position of the player.
 * @param {number} opponentPosition - Current paddle position of the opponent.
 * @param {Object} ballPosition - Object containing x and y coordinates of the ball.
 * @param {Function} onMove - Callback function to send updated paddle position to the server.
 * @param {Object} scores - Object containing player1 and player2 scores.
 */
function Pong({ playerNumber, playerPosition, opponentPosition, ballPosition, onMove, scores }) {
    
    const canvasRef = useRef(null); // Reference to the canvas element
    
    // Game Constants
    const PADDLE_WIDTH = 10;
    const PADDLE_HEIGHT = 100;
    const BALL_SIZE = 10;
    const CANVAS_WIDTH = 800;
    const CANVAS_HEIGHT = 400;
    const PADDLE_SPEED = 20; // Speed at which paddles move per key press

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d'); // Get 2D drawing context
        
        // Set canvas dimensions
        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;

        /**
         * Draws the ball on the canvas at the given position.
         */
        const drawBall = () => {
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.arc(ballPosition.x, ballPosition.y, BALL_SIZE, 0, Math.PI * 2);
            ctx.fill();
        };

        /**
         * Draws both paddles on the canvas.
         * - Ensures paddles are correctly assigned to Player 1 and Player 2.
         */
        const drawPaddles = () => {
            let leftPaddle = opponentPosition;
            if (playerNumber === 1) {
                leftPaddle = playerPosition;
            }

            let rightPaddle = playerPosition;
            if (playerNumber === 1) {
                rightPaddle = opponentPosition;
            }

            ctx.fillStyle = 'white';
            ctx.fillRect(30, leftPaddle, PADDLE_WIDTH, PADDLE_HEIGHT); // Left paddle
            
            ctx.fillRect(CANVAS_WIDTH - 30 - PADDLE_WIDTH, rightPaddle, PADDLE_WIDTH, PADDLE_HEIGHT); // Right paddle
        };

        /**
         * Draws the current scores for both players at the top of the screen.
         */
        const drawScores = () => {
            ctx.fillStyle = 'white';
            ctx.font = '32px Micro 5';
            ctx.textAlign = 'center';
            ctx.fillText(scores.player1.toString(), CANVAS_WIDTH * 0.25, 50); // Player 1 score
            ctx.fillText(scores.player2.toString(), CANVAS_WIDTH * 0.75, 50); // Player 2 score
        };

        /**
         * Draws the center dashed line to visually divide the game field.
         */
        const drawCenterLine = () => {
            ctx.strokeStyle = 'white';
            ctx.setLineDash([15, 15]); // Sets the line pattern
            ctx.beginPath();
            ctx.moveTo(CANVAS_WIDTH / 2, 0);
            ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
            ctx.stroke();
            ctx.setLineDash([]); // Resets line dash pattern
        };
        
        /**
         * Game loop that updates and redraws the canvas each frame.
         * - Clears the canvas.
         * - Draws the center line, paddles, ball, and scores.
         * - Uses requestAnimationFrame for optimized rendering.
         */
        const gameLoop = () => {
            ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); // Clears the canvas
            drawCenterLine();
            drawPaddles();
            drawBall();
            drawScores();
            requestAnimationFrame(gameLoop); // Calls the gameLoop again before the next frame
        };

        gameLoop(); // Start the game loop

        /**
         * Handles key presses for paddle movement.
         * - Moves the paddle up or down based on arrow key input.
         * - Calls the `onMove` function to update the player's position.
         */
        const handleKeyDown = (e) => {
            let newPos = playerPosition;

            if (e.key === 'ArrowUp') {
                newPos = Math.max(0, playerPosition - PADDLE_SPEED); // Move paddle up, ensuring it doesn't go past the top boundary
            } else if (e.key === 'ArrowDown') {
                newPos = Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, playerPosition + PADDLE_SPEED); // Move paddle down, ensuring it doesn't go past the bottom boundary
            }
            
            if (newPos !== playerPosition) {
                onMove(newPos); // Send new position to the WebSocket server
            }
        };

        /**
         * Handles mouse movement for paddle control.
         * - Updates paddle position based on mouse Y-coordinate.
         */
        const handleMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect(); // Get canvas bounding box
            const mouseYCoord = e.clientY - rect.top; // Get mouse Y position relative to canvas

            let newPos = mouseYCoord - (PADDLE_HEIGHT / 2); // Center paddle on mouse position
            newPos = Math.max(0, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, newPos)); // Ensure paddle stays within bounds

            if (Math.abs(newPos - playerPosition) > 1) {
                onMove(newPos); // Send new position to WebSocket if the movement is significant
            }
        };

        // Add event listeners for keyboard and mouse input
        document.addEventListener('keydown', handleKeyDown);
        canvas.addEventListener('mousemove', handleMouseMove);

        // Cleanup function to remove event listeners when the component unmounts
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            canvas.removeEventListener('mousemove', handleMouseMove);
        };

    }, [playerNumber, playerPosition, opponentPosition, ballPosition, onMove, scores]); // Dependencies: re-run effect when any of these change

    return (
        <div className='pong-div'>
            {/* Canvas for rendering the Pong game */}
            <canvas 
                ref={canvasRef} 
                style={{ 
                    background: '#1566A8', // Blue background
                    border: '2px solid white', // White border
                    borderRadius: '4px' // Rounded corners
                }} 
            />
        </div>
    );
};

export default Pong; // Export the Pong component
