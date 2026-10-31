param(
 [string]$InputPdf='reference/reviewer/ReviewerInvitation.TEMPLATE.pdf',
 [string]$OutputDirectory='local_only/pdf_qa',
 [int]$Width=1200,
 [int]$FirstPage=1,
 [int]$LastPage=0
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
[void][Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
[void][Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime]
[void][Windows.Data.Pdf.PdfPageRenderOptions,Windows.Data.Pdf,ContentType=WindowsRuntime]
[void][Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
[void][Windows.Storage.Streams.DataReader,Windows.Storage.Streams,ContentType=WindowsRuntime]
$generic=[System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetGenericArguments().Length -eq 1 -and $_.GetParameters().Length -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'}|Select-Object -First 1
$actionMethod=[System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object {$_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Length -eq 1 -and $_.GetParameters()[0].ParameterType.FullName -eq 'Windows.Foundation.IAsyncAction'}|Select-Object -First 1
if(-not $generic -or -not $actionMethod){throw 'Windows Runtime Task adapter unavailable'}
function Await-Result($operation,[Type]$type){
 $task=$generic.MakeGenericMethod(@($type)).Invoke($null,@($operation))
 if(-not $task.Wait(30000)){throw 'WinRT operation timed out'}
 return $task.GetAwaiter().GetResult()
}
function Await-Action($operation){
 $task=$actionMethod.Invoke($null,@($operation))
 if(-not $task.Wait(30000)){throw 'WinRT rendering timed out'}
 $task.GetAwaiter().GetResult()|Out-Null
}
$source=(Resolve-Path -LiteralPath $InputPdf).Path
$destination=[IO.Path]::GetFullPath((Join-Path (Get-Location).Path $OutputDirectory))
New-Item -ItemType Directory -Path $destination -Force|Out-Null
$file=Await-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync($source)) ([Windows.Storage.StorageFile])
$pdf=Await-Result ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
$count=[int]$pdf.PageCount
if($LastPage -eq 0){$LastPage=$count}
if($FirstPage -lt 1 -or $LastPage -gt $count -or $LastPage -lt $FirstPage){throw 'Invalid page range'}
$records=@()
for($number=$FirstPage;$number -le $LastPage;$number++){
 $page=$pdf.GetPage([uint32]($number-1));$stream=[Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
 $reader=$null
 try{
  $options=[Windows.Data.Pdf.PdfPageRenderOptions]::new();$options.DestinationWidth=[uint32]$Width
  Await-Action ($page.RenderToStreamAsync($stream,$options))
  $stream.Seek(0)
  $reader=[Windows.Storage.Streams.DataReader]::new($stream.GetInputStreamAt(0))
  [void](Await-Result ($reader.LoadAsync([uint32]$stream.Size)) ([uint32]))
  $bytes=New-Object byte[] ([int]$stream.Size);$reader.ReadBytes($bytes)
  $out=Join-Path $destination ('page-{0:D3}.png' -f $number)
  [IO.File]::WriteAllBytes($out,$bytes)
  $records+=@{page=$number;file=[IO.Path]::GetFileName($out);bytes=$bytes.Length;sha256=(Get-FileHash -LiteralPath $out -Algorithm SHA256).Hash.ToLowerInvariant()}
 }finally{if($reader){$reader.Dispose()};$stream.Dispose();$page.Dispose()}
}
# Contact sheets cover every rendered page. Review large individual pages separately.
$font=[Drawing.Font]::new('Segoe UI',11)
$sheets=@()
for($start=0;$start -lt $records.Count;$start+=9){
 $bmp=[Drawing.Bitmap]::new(990,1470);$g=[Drawing.Graphics]::FromImage($bmp)
 $g.Clear([Drawing.Color]::FromArgb(225,228,230))
 for($j=0;$j -lt 9 -and ($start+$j) -lt $records.Count;$j++){
  $record=$records[$start+$j];$img=[Drawing.Image]::FromFile((Join-Path $destination $record.file))
  try{
   $x=10+($j%3)*330;$y=10+[math]::Floor($j/3)*490
   $h=[int](310*$img.Height/$img.Width)
   $g.DrawImage($img,$x,$y,310,$h)
   $g.DrawString(('Page '+$record.page),$font,[Drawing.Brushes]::Black,$x,($y+$h+5))
  }finally{$img.Dispose()}
 }
 $name='sheet-{0:D2}.png' -f ([int]($start/9)+1)
 $bmp.Save((Join-Path $destination $name),[Drawing.Imaging.ImageFormat]::Png)
 $sheets+=$name;$g.Dispose();$bmp.Dispose()
}
$font.Dispose()
$report=@{renderer='Windows.Data.Pdf';source=$source;source_sha256=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant();page_count=$count;rendered_count=$records.Count;width=$Width;rendered_at=[DateTimeOffset]::Now.ToString('o');pages=$records;contact_sheets=$sheets;visual_review='PENDING'}
[IO.File]::WriteAllText((Join-Path $destination 'render_manifest.json'),($report|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
Write-Output ('PDF_RENDER_OK pages='+$count+' rendered='+$records.Count+' sheets='+$sheets.Count+' output='+$destination)
