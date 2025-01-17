import React, { useEffect, useState } from 'react';

const MainPage = ({identityInfo}) => {
    const headers = ["Rank", "Username", "ELO"];
    const [tableData, setTableData] = useState([]);

    useEffect(() => {
        const getLeaderboard = async () => {
            try {
                const response = await fetch(`/api/v1/leaderboard`, {
                    method: "GET"
                });
    
                let result = await response.json();
                result = result.map((user, i) => ({rank: i+1, username: user.username, elo: user.elo}));
                setTableData(result);
            } catch (e) {
                console.error(`Error fetching leaderboard: ${e}`);
            }
        };
        getLeaderboard();
    }, []);

    return (
        <div className="container">
            {identityInfo ? (
                <div className="row">
                    <h1 style={{color: "white"}}>LEADERBOARD</h1>
                    
                    <div className="col-md-6">
                        
                        <table className="table table-striped table-bordered table-dark">
                            <thead className="table-dark">
                                <tr>
                                    {headers.map((header, index) => (
                                    <th key={index}>{header}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                            {tableData.map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                {Object.values(row).map((value, colIndex) => (
                                    <td key={colIndex}>{value}</td>
                                ))}
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                    <div class="col-md-6">
                    <a href="/#/gamePage" className="btn btn-primary" role="button">
                        Play
                    </a>
                    </div>
                </div>
            ) : (
                <a href="/signin" className="btn btn-primary" role="button">
                    Log in
                </a>
            )}
        </div>
    );
}

export default MainPage;