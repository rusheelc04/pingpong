Group: Munir Emam, Rusheel Chande, Dhruv Ashok, Alex Han

Access the web app at: https://pong441.onrender.com/

# Target Audience
Our target audience is people who enjoy playing pong and would like to play with others over the internet. We would like to create a web app that lets users compete with randoms in competitive games where they can get a chance to be on the leaderboard. 
Users who are also seeking engaging interactions with others can do so using the live chat. We recognize the importance of interactions within multiplayer games and having a live chat will emphasize that. We also think that competitiveness is important and to promote this users who excel can have their names on a global leaderboard.

# Why use our application?
Our audience, as fans of pong or video games in general, will want a way to play with others online when playing in person is not an option. They want an experience that replicates a synchronous game of pong where they can communicate and compete with their opponent. Our application will provide this platform, allowing users to compete, see their position on the leaderboard, and socialize with other people with the same interests. Users will be able to enjoy a simple game of multiplayer pong no matter where they are located.

# Why we want to build the application
Pong is a classic game that was traditionally developed to be played in person at arcades or on the same video console. For many, Pong was the first video game they played and the game brings back fond memories of their childhood. While many other games such as chess have online multiplayer websites with a rating system and leaderboards, we noticed the lack of a similar website for Pong. As such, we would like to develop such an application to allow experienced players to relive the experience from the comfort of their own homes, as well as introduce those who have never played to the simple joys of the game.

To better simulate the in-person element of Pong, players are enabled to interact in our application via a live chat. As stated before, we extend the in-person version of Pong by adding an ELO-based rating system used to match people who want to play randomly. These features are useful for our users, but also present interesting technical challenges for us as developers, such as real-time communication via Websockets, content moderation, rating algorithms, and randomized game matching.

Overall, it is a combination of the lack of an existing solution and technical challenges of building such a solution that persuade us as developers to build this application.

# Architectural Diagram
![architectural diagram](diagrams/architectural.png)

# Data Flow
![data flow diagram](diagrams/data_flow.png)

# User Stories
| Priority | User      | Description                                        | Technical Implementation                                                                                                                                                                 |
|----------|-----------|----------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| P0       | As a user | I want to create an account and log in and out of it | When logging in, users will authenticate via Azure and will be stored in the ‘Users’ database.                                                                                           |
| P0       | As a user | I want to be able to play a game of pong against an opponent online | When starting a game, create a new game in the ‘Game’ database and use Websockets to enable real-time multiplayer.                                                                      |
| P1       | As a user | I want to be matched against a user of a similar skill level to me | Once logged in, fetch the ELO rating from the ‘Users’ database. Then, use Websockets to determine which other users are waiting to be matched and randomly match users within an ELO threshold. |
| P1       | As a user | I want to be able to send messages to my opponents while in-game | Once logged in and matched to a game, use Websockets to send messages to both users in the game session and continually poll for any new messages.                                       |
| P2       | As a user | I want to be able to see my match history          | Once logged in, fetch from the game endpoint and display all games the user has played, showing the final score, time played, and ELO rating.                                           |
| P2       | As a user | I want to see how well I am doing against everyone else who is playing Pong | Once logged in, fetch every user from the ‘Users’ database and sort them in descending order by their stored ELO rating.                                                                 |
| P2       | As a user | I want to be able to play Pong against my friends  | Once logged in, create a new game in the ‘Game’ database containing the two player IDs and redirect them both to that new game session.                                                  |

# Endpoints 
/user  
GET /user/login - user login to their account  
POST /user/signup - lets the user create a new account  
GET /user/profile - get all the profile information about the user  
PUT /user/profile - can update the existing information about the user  

/messages  
GET /messages - get the messages for a specific game  
POST /messages - send a message to a chat in a game  

/games  
GET /games - access the games  
/game/:id (this should be done with websockets and we should ensure that only authenticated users can read/write to this endpoint)  

/leaderboard  
GET /leaderboard - retrieves the global leaderboard and shows user profiles with the highest elo  
POST /matchmaking/find - find an opponent with the priority being similar elo.  

# Database Schemas
**User**  
user_id: ObjectId  
username: String  
password: String  
elo: Number  
createdAt: Date  
updatedAt: Date  

**Game**  
game_id: ObjectId  
player1: ObjectId  
player2: ObjectId  
startTime: Date  
endTime: Date  
score: { player1: Number, player2: Number }  
winner: ObjectId  
chatRoomId: ObjectId  
createdAt: Date  
updatedAt: Date  

**Message**  
message_id: ObjectId  
username: String  
chatRoomId: ObjectId  
message: String  
timestamp: Date  

