import React, { useEffect, useState, useRef } from 'react';

function Pong ({ playerNumber, playerPosition, opponentPosition, ballPosition, onMove, scores })  {
    const canvasRef = useRef(null);
    const PADDLE_WIDTH = 10;
    const PADDLE_HEIGHT = 100;
    const BALL_SIZE = 10;
    const CANVAS_WIDTH = 800;
    const CANVAS_HEIGHT = 400;
    const PADDLE_SPEED = 20;

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;

        // draws the ball and sets the ballposition to the given x and y props
        const drawBall = () => {
                ctx.fillStyle = 'white';
                ctx.beginPath();
                ctx.arc(ballPosition.x, ballPosition.y, BALL_SIZE, 0, Math.PI * 2);
                ctx.fill();
        };

        // padd.es are drawen and set relative to the opponent
        const drawPaddles = () => {
            // Ensure we have valid positions
            let leftPaddle = opponentPosition;
            if (playerNumber === 1) {
                leftPaddle = playerPosition;
            }

            let rightPaddle = playerPosition;
            if (playerNumber === 1) {
                rightPaddle = opponentPosition;
            }

            ctx.fillStyle = 'white';
            ctx.fillRect(30, leftPaddle, PADDLE_WIDTH, PADDLE_HEIGHT);
        
            ctx.fillStyle = 'white';
            ctx.fillRect(CANVAS_WIDTH - 30 - PADDLE_WIDTH, rightPaddle, PADDLE_WIDTH, PADDLE_HEIGHT);
        };

        // scores will be one the center of each halve
        const drawScores = () => {
            ctx.fillStyle = 'white';
            ctx.font = '32px Micro 5';
            ctx.textAlign = 'center';
            ctx.fillText(scores.player1.toString(), CANVAS_WIDTH * 0.25, 50);
            ctx.fillText(scores.player2.toString(), CANVAS_WIDTH * 0.75, 50);
        };

        // draws the dashed center line
        const drawCenterLine = () => {
            ctx.strokeStyle = 'white';
            ctx.setLineDash([15, 15]);
            ctx.beginPath();
            ctx.moveTo(CANVAS_WIDTH / 2, 0);
            ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
            ctx.stroke();
            ctx.setLineDash([]);
        };
        
        // these are the functions that are called every frame 
        // we use requestAnimationFrame because it tells our browser
        // its going to do an animation and needs to be supplied 
        // a callback function before the next frame is updated.
        const gameLoop = () => {
            ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            drawCenterLine();
            drawPaddles();
            drawBall();
            drawScores();
            requestAnimationFrame(gameLoop);
        };

        gameLoop();

        // when ever the key is pressed this handles what the position should be 
        // and then it passes that new position to the onMove function which will
        // send data back to the gamesocket on the players new position.
        const handleKeyDown = (e) => {
            let newPos = playerPosition;
            
            if (e.key === 'ArrowUp') {
                newPos = Math.max(0, playerPosition - PADDLE_SPEED);
            } else if (e.key === 'ArrowDown') {
                newPos = Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, playerPosition + PADDLE_SPEED);
            }
            
            if (newPos !== playerPosition) {
                onMove(newPos);
            }
        };

        const handleMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouseYCoord = e.clientY - rect.top;

            let newPos = mouseYCoord - (PADDLE_HEIGHT/ 2);
            newPos = Math.max(0, Math.min(CANVAS_HEIGHT-PADDLE_HEIGHT, newPos))

            if (Math.abs(newPos-playerPosition) > 1) {
                onMove(newPos)
            }
        }

        // add the eventlistener for key presses
        document.addEventListener('keydown', handleKeyDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            canvas.removeEventListener('mousemove', handleMouseMove);
        }

    }, [playerNumber, playerPosition, opponentPosition, ballPosition, onMove, scores]);

    return (
        <div className='pong-div'>
            <canvas 
                ref={canvasRef} 
                style={{ 
                    background: '#1566A8',
                    border: '2px solid white',
                    borderRadius: '4px'
                }} 
            />
        </div>
    );
};

export default Pong;