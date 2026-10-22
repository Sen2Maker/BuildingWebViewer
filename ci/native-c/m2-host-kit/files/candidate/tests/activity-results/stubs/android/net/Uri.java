package android.net;
public record Uri(String value) {
 public static Uri parse(String value){return new Uri(value);}
 public String getScheme(){int colon=value.indexOf(':');return colon<0?null:value.substring(0,colon);}
}
