function RunLoadTest {

    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $false)]
        [int]$TotalNumOfChannels = 20,      #100
		[Parameter(Mandatory = $false)]
        [int]$NumOfSubscribersPerChannel = 10,
        [Parameter(Mandatory = $false)]
        [int]$TotalRunTimePublisherInMinutes = 30,
        [Parameter(Mandatory = $false)]
        [string]$TestUid = [guid]::NewGuid()
    ) 
	
	
    Write-Host "TotalNumOfChannels ": $TotalNumOfChannels;
	createSubscribers -TotalNumOfChannels $TotalNumOfChannels -NumOfSubscribersPerChannel $NumOfSubscribersPerChannel
    Start-Sleep -s 60
    createPublishers -TotalNumOfChannels $TotalNumOfChannels -TotalRunTimePublisherInMinutes $TotalRunTimePublisherInMinutes

}

function createSubscribers{
		[CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]
        [int]$TotalNumOfChannels,
		[Parameter(Mandatory = $true)]
        [int]$NumOfSubscribersPerChannel
    )
	
    Write-Host "NumofSubscribersPerChannel: " : $NumofSubscribersPerChannel;

    $channel = 0;
    while($channel -ne $TotalNumOfChannels){
        $subscriber = 0;
        while($subscriber -ne $NumofSubscribersPerChannel){
            Write-Host "node subscriber.js " $channel " " $subscriber;
            # node .\subscriber.js $channel $subscriber;
            # Start-Process -NoNewWindow node .\subscriber.js $channelId $subscriber
            Start-Process -NoNewWindow -FilePath 'C:\Program Files (x86)\nodejs\node.exe' -ArgumentList '.\subscriber.js', "$channel", "$subscriber"
            $subscriber++;
        }
        $channel++;
    }
	
}

function createPublishers{
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)]
        [int]$TotalNumOfChannels,
        [Parameter(Mandatory = $true)]
        [int]$TotalRunTimePublisherInMinutes
    )

    $channel = 0;
  
    while($channel -ne $TotalNumOfChannels){
        Write-Host "node publisher.js " $channel;
        Start-Process -NoNewWindow -FilePath 'C:\Program Files (x86)\nodejs\node.exe' -ArgumentList '.\publisher.js', "$channel" , "$TotalRunTimePublisherInMinutes"
        $channel++;
    }

}